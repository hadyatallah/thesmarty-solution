// Governed read-only evidence snapshot captured through the connected TSS Google Sheets
// account on 6 October 2026 from the accepted Company Data Center Preview.
// This is not a live API binding and contains no private contact fields.

export const KITI_GELFANCO_GOVERNED_SNAPSHOT = Object.freeze({
  source: {
    system: 'TSS Company Data Center Preview',
    acceptanceState: 'Phase 3 accepted/closed for the approved bounded Preview scope on 3 October 2026',
    capturedAt: '2026-10-06',
    mode: 'read-only chat connector snapshot'
  },
  company: {
    companyId: 'TSS-CY-001',
    companyName: 'Gelfanco Ltd'
  },
  profile: {
    reconciliationRunId: 'RR-P3-LEGACY-001',
    disposition: 'Needs Review',
    canonicalIdentityState: 'Canonical Company match supported by official project page; legal registration not independently checked',
    developerRoleVerification: 'SOURCE SUPPORTED',
    contractorRoleVerification: 'UNVERIFIED',
    operatingStatus: 'Operating Status Unknown',
    developmentActivity: 'Observed Current Project Commercialization',
    geographyAssessment: 'Project geography evidenced in Kiti, Larnaca; operating geography Unknown',
    duplicateReviewState: 'Review Required',
    updatedAt: '2026-10-03T07:45:28.129Z',
    version: '23'
  },
  evidence: [
    {
      evidenceId: 'EV-P3-0001',
      factType: 'Developer Role',
      attributePath: 'developerRoles',
      displayValue: 'Residential Developer',
      verificationStatus: 'SOURCE SUPPORTED',
      freshnessStatus: 'Current',
      sourceRef: 'https://gelfanco.com/projects.html',
      observedAt: '2026-09-27',
      reviewNotes: 'Official project page calls Gelfanco Ltd Property Developers and lists a new residential project in Kiti.'
    },
    {
      evidenceId: 'EV-P3-0002',
      factType: 'Development Activity',
      attributePath: 'developmentActivity',
      displayValue: 'Official project page presents a residential development offering in Kiti; construction stage not stated.',
      verificationStatus: 'CONFLICTING / REVIEW REQUIRED',
      freshnessStatus: 'Review Due',
      sourceRef: 'https://gelfanco.com/projects.html',
      observedAt: '2026-09-27',
      reviewNotes: 'New-project wording is not a construction status; do not infer active construction.'
    },
    {
      evidenceId: 'EV-7267B12B92D94F15',
      factType: 'Development Activity',
      attributePath: 'developmentActivity',
      displayValue: 'Official Greek projects page lists Gelfanco 18-19-20 Homes in Kiti among available projects; this supports current project commercialization, not construction stage.',
      verificationStatus: 'CONFLICTING / REVIEW REQUIRED',
      freshnessStatus: 'Current',
      sourceRef: 'https://gelfanco.com/projectsGR.html',
      observedAt: '2026-09-28T14:59:38.610Z',
      reviewNotes: 'Listing under Available is a commercialization signal; it does not establish that construction is underway.'
    }
  ],
  evidenceState: 'Developer Role is source-supported. Two official project-page observations support current project commercialization in Kiti but do not establish construction stage. The shared developmentActivity path remains Conflict / Review Required pending controlled normalization.',
  researchGaps: [
    'Review and normalize the shared developmentActivity evidence-path encoding while retaining append-only evidence.',
    'Verify construction status project by project.',
    'Confirm legal registration.',
    'Assess Contractor Role.',
    'Assess operating status and operating geography.',
    'Assess digital footprint and public contact routes.',
    'Assess group relationships.',
    'Current appetite for the TSS Kiti Opportunity remains Unknown.',
    'Capacity remains Unknown.'
  ]
});

export function governedKitiMatchFixture(){
  const s=KITI_GELFANCO_GOVERNED_SNAPSHOT;
  return {
    id:'MAT-KITI-GELFANCO-FIXTURE',
    companyId:s.company.companyId,
    companyName:s.company.companyName,
    qualificationState:'Under Qualification',
    engagementState:'Not Contacted',
    criteria:[
      {
        type:'Mandatory',
        name:'Developer Role',
        outcome:s.profile.developerRoleVerification==='SOURCE SUPPORTED'?'Meets':'Unknown',
        evidenceIds:['EV-P3-0001']
      },
      {
        type:'Mandatory',
        name:'Residential development capability',
        outcome:'Meets',
        evidenceIds:['EV-P3-0001','EV-P3-0002','EV-7267B12B92D94F15'],
        note:'Evidence supports residential-development role and Kiti project commercialization, not construction stage.'
      },
      {
        type:'Preferred',
        name:'Cyprus relevance',
        outcome:'Meets',
        evidenceIds:['EV-P3-0001','EV-P3-0002','EV-7267B12B92D94F15']
      },
      {
        type:'Preferred',
        name:'Kiti relevance',
        outcome:'Meets',
        evidenceIds:['EV-P3-0001','EV-P3-0002','EV-7267B12B92D94F15']
      },
      {
        type:'Informational',
        name:'Current appetite',
        outcome:'Unknown',
        evidenceIds:[],
        note:'Capability and Kiti relevance do not establish current appetite.'
      },
      {
        type:'Informational',
        name:'Capacity',
        outcome:'Unknown',
        evidenceIds:[]
      }
    ],
    gaps:[...s.researchGaps],
    suppressed:false,
    evidenceSnapshotVersion:s.profile.version,
    evidenceSnapshotUpdatedAt:s.profile.updatedAt,
    dataCenterDisposition:s.profile.disposition,
    dataCenterDuplicateReview:s.profile.duplicateReviewState,
    operatingStatus:s.profile.operatingStatus,
    developmentActivity:s.profile.developmentActivity
  };
}
