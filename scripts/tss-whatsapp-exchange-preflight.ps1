# Read-only Exchange authorization inspection. No permission or mail mutations.
[CmdletBinding()]
param([switch]$UseCurrentSession,[string]$ReportPath=(Join-Path (Get-Location) 'tss-whatsapp-exchange-report.json'))
$ErrorActionPreference='Stop'
$AppId='1b834ef7-b258-41fb-8ca9-ea9f093b4264'
$TenantId='0d3c6e54-c584-44a3-bb2d-4533b5393fc6'
$Mailbox='info@thesmartysolution.com'
$report=[ordered]@{kind='read-only-exchange-mail-scope';appId=$AppId;tenantId=$TenantId;mailbox=$Mailbox;changes=@();emailsSent=0;result='PENDING';runtimeAttachmentAllowed=$false;entraApplicationMailSend='PRESENT_AT_LAST_ENTRA_READBACK';entraGrantMustBeRechecked=$true;tests=@()}
function Reference([string]$value){$bytes=[Text.Encoding]::UTF8.GetBytes($value.ToLowerInvariant());return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
function ScopeBoolean($value){
 if($value -is [bool]){return $value}
 if([string]$value -ceq 'True'){return $true}
 if([string]$value -ceq 'False'){return $false}
 throw 'unclassified_scope_response'
}
function SendRows($rows){return @($rows | Where-Object {($_.RoleName -in @('Application Mail.Send','Application Mail Full Access','Application Exchange Full Access')) -or (([string]$_.GrantedPermissions -split '[,;\s{}]+') -contains 'Mail.Send')})}
try{
 if(-not $UseCurrentSession){
  if(-not (Get-Module -ListAvailable ExchangeOnlineManagement)){throw 'exchange_module_required'}
  Import-Module ExchangeOnlineManagement
  Connect-ExchangeOnline -UserPrincipalName $Mailbox -ShowBanner:$false
 }
 $required=@('Get-ConnectionInformation','Get-EXOMailbox','Get-ApplicationAccessPolicy','Get-ServicePrincipal','Test-ApplicationAccessPolicy','Test-ServicePrincipalAuthorization','Get-ManagementRoleAssignment')
 foreach($name in $required){if(-not (Get-Command $name -ErrorAction SilentlyContinue)){throw 'exchange_command_unavailable'}}
 $connections=@(Get-ConnectionInformation | Where-Object {[string]$_.TenantID -eq $TenantId -and [string]$_.State -eq 'Connected'})
 if($connections.Count -ne 1){throw 'exact_connected_tenant_required'}
 $mailboxes=@(Get-EXOMailbox -ResultSize Unlimited -RecipientTypeDetails UserMailbox,SharedMailbox,RoomMailbox,EquipmentMailbox)
 $primary=@($mailboxes | Where-Object {[string]$_.PrimarySmtpAddress -ieq $Mailbox})
 if($primary.Count -ne 1){throw 'tss_mailbox_not_found_or_ambiguous'}
 $others=@($mailboxes | Where-Object {[string]$_.PrimarySmtpAddress -ine $Mailbox})
 $report.mailboxCount=$mailboxes.Count
 $policies=@(Get-ApplicationAccessPolicy)
 $appPolicies=@($policies | Where-Object {(@($_.AppId) -contains $AppId) -or (@($_.AppId) -contains '*')})
 $report.legacyPolicies=@($appPolicies | ForEach-Object {@{identity=[string]$_.Identity;accessRight=[string]$_.AccessRight;scopeName=[string]$_.ScopeName;appIds=@($_.AppId)}})
 $principals=@(Get-ServicePrincipal | Where-Object {[string]$_.AppId -eq $AppId})
 if($principals.Count -gt 1){throw 'exchange_principal_ambiguous'}
 $report.exchangePrincipalPresent=($principals.Count -eq 1)
 if($principals.Count -eq 1){
  $report.exchangeAssignments=@(Get-ManagementRoleAssignment -RoleAssignee $principals[0].Identity | ForEach-Object {@{role=[string]$_.Role;enabled=$_.Enabled;customResourceScope=[string]$_.CustomResourceScope;recipientScope=[string]$_.RecipientWriteScope}})
  $report.rbacEntitlements=@(Test-ServicePrincipalAuthorization -Identity $AppId | ForEach-Object {@{roleName=[string]$_.RoleName;permissions=[string]$_.GrantedPermissions;scope=[string]$_.AllowedResourceScope;scopeType=[string]$_.ScopeType}})
 }else{$report.exchangeAssignments=@();$report.rbacEntitlements=@()}
 foreach($box in @($primary)+@($others)){
  $address=[string]$box.PrimarySmtpAddress
  $aap=@(Test-ApplicationAccessPolicy -Identity $address -AppId $AppId)
  if($aap.Count -ne 1 -or [string]$aap[0].AccessCheckResult -notin @('Granted','Denied')){throw 'legacy_authorization_unclassified'}
  $legacyAllowed=([string]$aap[0].AccessCheckResult -eq 'Granted')
  $rbacAllowed=$false
  if($principals.Count -eq 1){
   $rbac=@(Test-ServicePrincipalAuthorization -Identity $AppId -Resource $address)
   foreach($row in (SendRows $rbac)){if(ScopeBoolean $row.InScope){$rbacAllowed=$true}}
  }
  # Entra application Mail.Send exists at last readback. AAP constrains that
  # path. Scoped RBAC is additive, so neither path can be ignored.
  $effective=($legacyAllowed -or $rbacAllowed)
  $report.tests+=@{target=if($address -ieq $Mailbox){'TSS'}else{'OTHER'};mailboxReference=(Reference $address);legacyAllowed=$legacyAllowed;rbacAllowed=$rbacAllowed;effectiveSendAllowed=$effective}
 }
 $target=@($report.tests | Where-Object {$_.target -eq 'TSS'})[0]
 $outside=@($report.tests | Where-Object {$_.target -eq 'OTHER'})
 if(@($outside | Where-Object {$_.effectiveSendAllowed}).Count -gt 0){$report.result='FAIL_OTHER_MAILBOX_ALLOWED'}
 elseif(-not $target.effectiveSendAllowed){$report.result='FAIL_TSS_MAILBOX_DENIED'}
 elseif($outside.Count -eq 0){$report.result='PENDING_NO_EXISTING_UNRELATED_MAILBOX'}
 else{$report.result='EXCHANGE_CURRENT_MAILBOX_TESTS_PASS_ENTRA_READBACK_REQUIRED'}
 $report.scopeLimit='Tests apply to existing user/shared/room/equipment mailboxes. Inspect reported scope definitions and current Entra grants before runtime attachment. No Microsoft token or Graph send was attempted.'
}catch{
 $report.result='BLOCKED'
 $safe=@('exchange_module_required','exchange_command_unavailable','exact_connected_tenant_required','tss_mailbox_not_found_or_ambiguous','exchange_principal_ambiguous','legacy_authorization_unclassified','unclassified_scope_response')
 $report.error=if($_.Exception.Message -in $safe){$_.Exception.Message}else{'exchange_read_or_authorization_test_failed'}
}finally{
 $json=$report | ConvertTo-Json -Depth 12
 [IO.File]::WriteAllText($ReportPath,$json,[Text.UTF8Encoding]::new($false))
 Write-Output $json
}
if($report.result -notlike 'EXCHANGE_CURRENT_MAILBOX_TESTS_PASS*'){exit 1}
