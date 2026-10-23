$ErrorActionPreference='Stop'
$scriptPath=Join-Path $PSScriptRoot '../scripts/tss-whatsapp-exchange-preflight.ps1'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('tss-exchange-fixtures-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$global:fixture=[ordered]@{legacyOther='Denied';rbacOther=$false;legacyTarget='Granted';rbacTarget=$false;principal=$false;other=$true;tenant='0d3c6e54-c584-44a3-bb2d-4533b5393fc6';scopeValue=$null;permissionError=$false}
function Get-ConnectionInformation { [pscustomobject]@{TenantID=$global:fixture.tenant;State='Connected'} }
function Get-EXOMailbox {
 [pscustomobject]@{PrimarySmtpAddress='info@thesmartysolution.com'}
 if($global:fixture.other){[pscustomobject]@{PrimarySmtpAddress='private-fixture@example.com'}}
}
function Get-ApplicationAccessPolicy {
 if($global:fixture.permissionError){throw 'PRIVATE_PROVIDER_RESPONSE'}
 [pscustomobject]@{AppId='1b834ef7-b258-41fb-8ca9-ea9f093b4264';Identity='fixture-policy';AccessRight='RestrictAccess';ScopeName='fixture-group'}
}
function Get-ServicePrincipal {if($global:fixture.principal){[pscustomobject]@{AppId='1b834ef7-b258-41fb-8ca9-ea9f093b4264';Identity='fixture-principal'}}}
function Get-ManagementRoleAssignment {[pscustomobject]@{Role='Application Mail.Send';Enabled=$true;CustomResourceScope='fixture-scope';RecipientWriteScope='CustomResourceScope'}}
function Test-ApplicationAccessPolicy {param($Identity,$AppId);[pscustomobject]@{AccessCheckResult=if($Identity -eq 'info@thesmartysolution.com'){$global:fixture.legacyTarget}else{$global:fixture.legacyOther}}}
function Test-ServicePrincipalAuthorization {
 param($Identity,$Resource)
 if(-not $Resource){return [pscustomobject]@{RoleName='Application Mail.Send';GrantedPermissions='Mail.Send';AllowedResourceScope='fixture-scope';ScopeType='CustomResourceScope';InScope='Not Run'}}
 $scope=if($null -ne $global:fixture.scopeValue){$global:fixture.scopeValue}elseif($Resource -eq 'info@thesmartysolution.com'){$global:fixture.rbacTarget}else{$global:fixture.rbacOther}
 [pscustomobject]@{RoleName='Application Mail.Send';GrantedPermissions='Mail.Send';InScope=$scope}
}
function Run-Fixture {
 $result=& $scriptPath -UseCurrentSession -ReportPath (Join-Path $temp 'report.json')
 return ($result | ConvertFrom-Json)
}
function Expect($actual,$expected){if($actual -cne $expected){throw "Expected $expected, received $actual"}}
try{
 $r=Run-Fixture;Expect $r.result 'EXCHANGE_CURRENT_MAILBOX_TESTS_PASS_ENTRA_READBACK_REQUIRED';Expect $r.runtimeAttachmentAllowed $false
 $global:fixture.legacyOther='Granted';$r=Run-Fixture;Expect $r.result 'FAIL_OTHER_MAILBOX_ALLOWED'
 $global:fixture.legacyOther='Denied';$global:fixture.principal=$true;$global:fixture.rbacOther=$true
 $r=Run-Fixture;Expect $r.result 'FAIL_OTHER_MAILBOX_ALLOWED'
 $global:fixture.rbacOther=$false;$global:fixture.scopeValue='False';$r=Run-Fixture
 Expect $r.result 'EXCHANGE_CURRENT_MAILBOX_TESTS_PASS_ENTRA_READBACK_REQUIRED'
 $global:fixture.scopeValue='Not Run';$r=Run-Fixture;Expect $r.result 'BLOCKED';Expect $r.error 'unclassified_scope_response'
 $global:fixture.scopeValue=$null;$global:fixture.other=$false;$r=Run-Fixture;Expect $r.result 'PENDING_NO_EXISTING_UNRELATED_MAILBOX'
 $global:fixture.other=$true;$global:fixture.tenant='wrong';$r=Run-Fixture;Expect $r.result 'BLOCKED';Expect $r.error 'exact_connected_tenant_required'
 $global:fixture.tenant='0d3c6e54-c584-44a3-bb2d-4533b5393fc6';$global:fixture.permissionError=$true
 $r=Run-Fixture;Expect $r.result 'BLOCKED';Expect $r.error 'exchange_read_or_authorization_test_failed'
 if(($r|ConvertTo-Json -Depth 12) -match 'PRIVATE_PROVIDER_RESPONSE|private-fixture@example.com'){throw 'Unsanitized diagnostic'}
 Write-Output 'PASS: 8 read-only Exchange scope fixture scenarios; no Microsoft API contacted.'
}finally{
 Remove-Item -LiteralPath $temp -Recurse -Force
}
exit 0
