import { gql } from '@apollo/client';

export const SIGN_IN = gql`
  mutation SignIn($input: SignInInput!) {
    signIn(input: $input) {
      token
      angemeldetBleiben
      user {
        id
        email
        firstName
        lastName
      }
      workspace {
        id
        name
        slug
      }
    }
  }
`;

export const REQUEST_PASSWORD_RESET = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(input: { email: $email })
  }
`;

export const RESET_PASSWORD = gql`
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(input: { token: $token, password: $password })
  }
`;

export const VERIFY_EMAIL = gql`
  mutation VerifyEmail($token: String!) {
    verifyEmail(input: { token: $token })
  }
`;

export const RESEND_EMAIL_VERIFICATION = gql`
  mutation ResendEmailVerification {
    resendEmailVerification
  }
`;

export const ME = gql`
  query Me {
    me {
      id
      email
      emailVerifiedAt
    }
  }
`;

export const SIGN_OUT = gql`
  mutation SignOut($input: RefreshInput) {
    signOut(input: $input)
  }
`;

export const SIGN_UP = gql`
  mutation SignUp($input: SignUpInput!) {
    signUp(input: $input) {
      token
      angemeldetBleiben
      user {
        id
        email
        firstName
        lastName
      }
      workspace {
        id
        name
        slug
      }
    }
  }
`;

export const WORKSPACE_SUMMARY = gql`
  query WorkspaceSummary {
    workspaceSummary {
      companyCount
      contactCount
      openDealCount
      openPipelineValue
      openTaskCount
      overdueTaskCount
      betraegeVerborgen
    }
    pipeline {
      stage
      dealCount
      totalAmount
    }
  }
`;

const LIST_VARS =
  '$search: String, $limit: Int, $offset: Int, $sortField: String, $sortDirection: SortDirection, $customFilters: [CustomFieldFilterInput!], $filterVerknuepfung: FilterVerknuepfung, $gruppierung: String, $gruppe: ListenGruppeInput, $zeitraum: ListenZeitraumInput';
const LIST_ARGS =
  'search: $search, limit: $limit, offset: $offset, sortField: $sortField, sortDirection: $sortDirection, customFilters: $customFilters, filterVerknuepfung: $filterVerknuepfung, gruppierung: $gruppierung, gruppe: $gruppe, zeitraum: $zeitraum';

const GRUPPEN =
  'gruppen { wert label nichtSichtbar anzahl summen { gruppe summe } }';

export const COMPANIES = gql`
  query Companies(${LIST_VARS}, $industry: String, $country: String, $ownerId: ID) {
    companies(${LIST_ARGS}, industry: $industry, country: $country, ownerId: $ownerId) {
      totalCount
      hasMore
      summen { gruppe summe }
      ${GRUPPEN}
      items {
        customFields
        id
        name
        domain
        industry
        employeeCount
        annualRevenue
        city
        country
        owner { id firstName lastName }
      }
    }
    companyIndustries
  }
`;

export const COMPANY_OPTIONS = gql`
  query CompanyOptions {
    companies(limit: 200, sortField: "name", sortDirection: ASC) {
      items {
        id
        name
      }
    }
  }
`;

export const CREATE_COMPANY = gql`
  mutation CreateCompany($input: CreateCompanyInput!) {
    createCompany(input: $input) {
      customFields
      id
      name
      domain
      industry
      employeeCount
      annualRevenue
      city
      country
      owner {
        id
        firstName
        lastName
      }
    }
  }
`;

export const DELETE_COMPANY = gql`
  mutation DeleteCompany($id: ID!) {
    deleteCompany(id: $id)
  }
`;

export const CONTACTS = gql`
  query Contacts(${LIST_VARS}, $companyId: ID, $ownerId: ID) {
    contacts(${LIST_ARGS}, companyId: $companyId, ownerId: $ownerId) {
      totalCount
      hasMore
      ${GRUPPEN}
      items {
        customFields
        id
        firstName
        lastName
        email
        phone
        jobTitle
        companyId
        company { id name }
        owner { id firstName lastName }
      }
    }
  }
`;

export const CREATE_CONTACT = gql`
  mutation CreateContact($input: CreateContactInput!) {
    createContact(input: $input) {
      customFields
      id
      firstName
      lastName
      email
      phone
      jobTitle
      companyId
      company {
        id
        name
      }
      owner {
        id
        firstName
        lastName
      }
    }
  }
`;

export const DELETE_CONTACT = gql`
  mutation DeleteContact($id: ID!) {
    deleteContact(id: $id)
  }
`;

export const DEALS = gql`
  query Deals(${LIST_VARS}, $stage: DealStage, $companyId: ID, $openOnly: Boolean, $ownerId: ID, $ruhendTage: Int, $pipelineId: ID) {
    deals(${LIST_ARGS}, stage: $stage, companyId: $companyId, openOnly: $openOnly, ownerId: $ownerId, ruhendTage: $ruhendTage, pipelineId: $pipelineId) {
      totalCount
      hasMore
      summen { gruppe summe }
      ${GRUPPEN}
      items {
        customFields
        id
        name
        amount
        currency
        stage
        pipelineId
        closeDate
        probability
        lostReason
        companyId
        company { id name }
        owner { id firstName lastName }
      }
    }
  }
`;

export const CREATE_DEAL = gql`
  mutation CreateDeal($input: CreateDealInput!) {
    createDeal(input: $input) {
      customFields
      id
      name
      amount
      currency
      stage
      pipelineId
      closeDate
      probability
      lostReason
      companyId
      company {
        id
        name
      }
      owner {
        id
        firstName
        lastName
      }
    }
  }
`;

export const MOVE_DEAL_TO_STAGE = gql`
  mutation MoveDealToStage($id: ID!, $stage: DealStage!) {
    moveDealToStage(id: $id, stage: $stage) {
      id
      stage
    }
  }
`;

export const DELETE_DEAL = gql`
  mutation DeleteDeal($id: ID!) {
    deleteDeal(id: $id)
  }
`;

const RAIL_APPOINTMENT_FIELDS = `
  id
  title
  startDate
  startTime
  endDate
  minutes
  allDay
  location
  videoLink
  cancelledAt
  geschwaerzt
`;

const TASK_FIELDS = `
  id
  title
  description
  dueDate
  dueTime
  status
  inArbeitSeit
  completedAt
  isOverdue
  assigneeId
  assigneeName
  customFields
  companyId
  contactId
  dealId
  company { id name }
  contact { id firstName lastName }
  deal { id name }
`;

const NOTE_FIELDS = `
  id
  body
  authorName
  createdAt
  bearbeitetAm
  bearbeitetVon
  companyId
  contactId
  dealId
  company { id name }
  contact { id firstName lastName }
  deal { id name }
`;

const CUSTOM_FIELD_FIELDS = `
  id
  entity
  key
  label
  type
  options
  farben { option farbe }
  waehrung
  eindeutig
  required
  pflichtAbPhase
  nachkommastellen
  zahlformat
  datumsformat
  position
  archivedAt
  beschreibung
  standardwert
  gruppeId
  zielEntity
  mehrere
  gegenfeldId
  gegenseite
`;

export const CUSTOM_FIELDS = gql`
  query CustomFields($entity: CustomFieldEntity) {
    customFields(entity: $entity) { ${CUSTOM_FIELD_FIELDS} }
  }
`;

export const CREATE_CUSTOM_FIELD = gql`
  mutation CreateCustomField($input: CreateCustomFieldInput!) {
    createCustomField(input: $input) { ${CUSTOM_FIELD_FIELDS} }
  }
`;

export const UPDATE_CUSTOM_FIELD = gql`
  mutation UpdateCustomField($input: UpdateCustomFieldInput!) {
    updateCustomField(input: $input) { ${CUSTOM_FIELD_FIELDS} }
  }
`;

export const ARCHIVE_CUSTOM_FIELD = gql`
  mutation ArchiveCustomField($id: ID!) {
    archiveCustomField(id: $id) { ${CUSTOM_FIELD_FIELDS} }
  }
`;

export const RESTORE_CUSTOM_FIELD = gql`
  mutation RestoreCustomField($id: ID!) {
    restoreCustomField(id: $id) { ${CUSTOM_FIELD_FIELDS} }
  }
`;

export const VERWEIS_TITEL = gql`
  query VerweisTitel($ziel: CustomFieldEntity!, $ids: [ID!]!) {
    verweisTitel(ziel: $ziel, ids: $ids) {
      id
      titel
      sichtbar
    }
  }
`;

export const GEGENFELD_WERTE = gql`
  query GegenfeldWerte($entity: CustomFieldEntity!, $id: ID!) {
    gegenfeldWerte(entity: $entity, id: $id) {
      feldId
      quelle
      eintraege {
        id
        titel
      }
      nichtSichtbar
    }
  }
`;

const CUSTOM_FIELD_GROUP_FIELDS = `
  id
  entity
  name
  position
  eingeklappt
`;

export const CUSTOM_FIELD_GROUPS = gql`
  query CustomFieldGroups($entity: CustomFieldEntity) {
    customFieldGroups(entity: $entity) { ${CUSTOM_FIELD_GROUP_FIELDS} }
  }
`;

export const CREATE_CUSTOM_FIELD_GROUP = gql`
  mutation CreateCustomFieldGroup($input: CreateCustomFieldGroupInput!) {
    createCustomFieldGroup(input: $input) { ${CUSTOM_FIELD_GROUP_FIELDS} }
  }
`;

export const UPDATE_CUSTOM_FIELD_GROUP = gql`
  mutation UpdateCustomFieldGroup($input: UpdateCustomFieldGroupInput!) {
    updateCustomFieldGroup(input: $input) { ${CUSTOM_FIELD_GROUP_FIELDS} }
  }
`;

export const DELETE_CUSTOM_FIELD_GROUP = gql`
  mutation DeleteCustomFieldGroup($id: ID!) {
    deleteCustomFieldGroup(id: $id)
  }
`;

export const FELD_FUELLGRAD = gql`
  query FeldFuellgrad($entity: CustomFieldEntity!) {
    feldFuellgrad(entity: $entity) {
      key
      gefuellt
      gesamt
    }
  }
`;

export const PLZ_ORTE = gql`
  query PlzOrte($plz: String!, $land: String) {
    plzOrte(plz: $plz, land: $land) {
      ort
      bundesland
    }
  }
`;

const SAVED_VIEW_FIELDS = `
  id
  entity
  name
  createdById
  search
  sortField
  sortDirection
  customFilters
  columns
  filters
  privat
  isDefault
  gruppierung
  filterVerknuepfung
  darstellung
  gruppenFeld
  datumFeld
`;

export const RENAME_WORKSPACE = gql`
  mutation RenameWorkspace($name: String!) {
    renameWorkspace(name: $name) {
      id
      name
      slug
    }
  }
`;

export const MY_ROLE = gql`
  query MyRole {
    myRole
  }
`;

export const SAVED_VIEWS = gql`
  query SavedViews($entity: CustomFieldEntity!) {
    savedViews(entity: $entity) { ${SAVED_VIEW_FIELDS} }
  }
`;

export const CREATE_SAVED_VIEW = gql`
  mutation CreateSavedView($input: CreateSavedViewInput!) {
    createSavedView(input: $input) { ${SAVED_VIEW_FIELDS} }
  }
`;

export const UPDATE_SAVED_VIEW = gql`
  mutation UpdateSavedView($input: UpdateSavedViewInput!) {
    updateSavedView(input: $input) { ${SAVED_VIEW_FIELDS} }
  }
`;

export const SET_DEFAULT_SAVED_VIEW = gql`
  mutation SetDefaultSavedView($entity: CustomFieldEntity!, $id: ID) {
    setDefaultSavedView(entity: $entity, id: $id)
  }
`;

export const DELETE_SAVED_VIEW = gql`
  mutation DeleteSavedView($id: ID!) {
    deleteSavedView(id: $id)
  }
`;

export const COMPANY_DETAIL = gql`
  query CompanyDetail($id: ID!) {
    company(id: $id) {
      id
      owner { id firstName lastName }
      name
      domain
      zweitdomains
      website
      linkedin
      industry
      employeeCount
      annualRevenue
      street
      postalCode
      city
      country
      invoiceEmail
      phone
      email
      vertretung
      registergericht
      registernummer
      ustIdNr
      logo
      logoQuelle
      customFields
      createdAt
      parentCompanyId
      parentCompany { id name }
      tochterfirmen { id name city }
      contacts { id firstName lastName email jobTitle }
      deals { id name amount currency stage pipelineId closeDate }
      appointments { ${RAIL_APPOINTMENT_FIELDS} }
      tasks { ${TASK_FIELDS} }
      notes { ${NOTE_FIELDS} }
      kontaktNotizen { ${NOTE_FIELDS} contactId }
      kontaktAufgaben { ${TASK_FIELDS} }
      kontaktTermine { ${RAIL_APPOINTMENT_FIELDS} contactId }
    }
  }
`;

export const CONTACT_DETAIL = gql`
  query ContactDetail($id: ID!) {
    contact(id: $id) {
      id
      owner { id firstName lastName }
      firstName
      lastName
      unzustellbarSeit
      unzustellbarGrund
      email
      phone
      weitereEmails { art wert unzustellbarSeit }
      weitereTelefone { art wert }
      jobTitle
      street
      postalCode
      city
      country
      linkedin
      createdAt
      customFields
      companyId
      company { id name }
      deals { id name amount currency stage pipelineId closeDate primaryContactId }
      beteiligungen { id dealId rolle }
      verteiler { id name }
      appointments { ${RAIL_APPOINTMENT_FIELDS} }
      tasks { ${TASK_FIELDS} }
      notes { ${NOTE_FIELDS} }
    }
  }
`;

export const DEAL_DETAIL = gql`
  query DealDetail($id: ID!) {
    deal(id: $id) {
      id
      owner { id firstName lastName }
      name
      amount
      currency
      stage
      pipelineId
      closeDate
      probability
      createdAt
      customFields
      lostReason
      letzteAktivitaet
      companyId
      company { id name }
      primaryContactId
      primaryContact { id firstName lastName email }
      beteiligte {
        id
        contactId
        rolle
        contact { id firstName lastName email jobTitle }
      }
      appointments { ${RAIL_APPOINTMENT_FIELDS} }
      beteiligtenTermine { ${RAIL_APPOINTMENT_FIELDS} }
      tasks { ${TASK_FIELDS} }
      notes { ${NOTE_FIELDS} }
    }
  }
`;

export const UPDATE_COMPANY = gql`
  mutation UpdateCompany($input: UpdateCompanyInput!) {
    updateCompany(input: $input) {
      customFields
      id
      owner {
        id
        firstName
        lastName
      }
      name
      domain
      zweitdomains
      website
      linkedin
      industry
      employeeCount
      annualRevenue
      street
      postalCode
      city
      country
      invoiceEmail
      phone
      email
      vertretung
      registergericht
      registernummer
      ustIdNr
    }
  }
`;

export const UPDATE_CONTACT = gql`
  mutation UpdateContact($input: UpdateContactInput!) {
    updateContact(input: $input) {
      customFields
      id
      owner {
        id
        firstName
        lastName
      }
      firstName
      lastName
      email
      phone
      weitereEmails {
        art
        wert
        unzustellbarSeit
      }
      weitereTelefone {
        art
        wert
      }
      jobTitle
      street
      postalCode
      city
      country
      linkedin
      company {
        id
        name
      }
    }
  }
`;

export const UPDATE_DEAL = gql`
  mutation UpdateDeal($input: UpdateDealInput!) {
    updateDeal(input: $input) {
      customFields
      id
      owner {
        id
        firstName
        lastName
      }
      name
      amount
      currency
      stage
      pipelineId
      closeDate
      probability
      lostReason
      company {
        id
        name
      }
    }
  }
`;

export const CREATE_NOTE = gql`
  mutation CreateNote($input: CreateNoteInput!) {
    createNote(input: $input) {
      ${NOTE_FIELDS}
    }
  }
`;

export const UPDATE_NOTE = gql`
  mutation UpdateNote($input: UpdateNoteInput!) {
    updateNote(input: $input) {
      id
      body
      bearbeitetAm
      bearbeitetVon
    }
  }
`;

export const HERKUNFT = gql`
  query Herkunft($entityType: String!, $entityId: ID!) {
    herkunft(entityType: $entityType, entityId: $entityId) {
      erstelltVon
      erstelltAm
      geaendertVon
      geaendertAm
      quelle
    }
  }
`;

export const DELETE_NOTE = gql`
  mutation DeleteNote($id: ID!) {
    deleteNote(id: $id)
  }
`;

export const WORKSPACE_MEMBERS = gql`
  query WorkspaceMembers {
    workspaceMembers {
      id
      role
      roleId
      roleRef {
        id
        name
      }
      user {
        id
        firstName
        lastName
        email
      }
    }
    pendingInvitations {
      id
      email
      role
      expiresAt
    }
  }
`;

export const MY_WORKSPACES = gql`
  query MyWorkspaces {
    myWorkspaces {
      id
      role
      taskDigest
      erwaehnungMail
      workspace {
        id
        name
        slug
        baseInterestRatePercent
        zweiFaktorPflicht
      }
    }
  }
`;

export const INVITE_MEMBER = gql`
  mutation InviteMember($input: InviteMemberInput!) {
    inviteMember(input: $input) {
      inviteUrl
      delivered
      invitation {
        id
        email
        role
        expiresAt
      }
    }
  }
`;

export const EINLADUNGS_VORSCHLAEGE = gql`
  query EinladungsVorschlaege {
    einladungsVorschlaege {
      email
      name
      anzahl
    }
  }
`;

export const REVOKE_INVITATION = gql`
  mutation RevokeInvitation($id: String!) {
    revokeInvitation(id: $id)
  }
`;

export const REMOVE_MEMBER = gql`
  mutation RemoveMember($input: RemoveMemberInput!) {
    removeMember(input: $input) {
      removed
      reassignedTasks
    }
  }
`;

export const ACCEPT_INVITATION = gql`
  mutation AcceptInvitation($input: AcceptInvitationInput!) {
    acceptInvitation(input: $input) {
      workspaceId
      role
    }
  }
`;

export const SWITCH_WORKSPACE = gql`
  mutation SwitchWorkspace($workspaceId: ID!) {
    switchWorkspace(workspaceId: $workspaceId) {
      token
      angemeldetBleiben
      user {
        id
        email
        firstName
        lastName
      }
      workspace {
        id
        name
        slug
      }
    }
  }
`;

export const TASK = gql`
  query Task($id: ID!) {
    task(id: $id) { ${TASK_FIELDS} }
  }
`;

export const TASKS = gql`
  query Tasks(${LIST_VARS}, $assigneeId: ID, $completed: Boolean, $overdue: Boolean, $status: String) {
    tasks(${LIST_ARGS}, assigneeId: $assigneeId, completed: $completed, overdue: $overdue, status: $status) {
      totalCount
      hasMore
      items { ${TASK_FIELDS} }
    }
  }
`;

export const MY_OPEN_TASKS = gql`
  query MyOpenTasks($limit: Int) {
    myOpenTasks(limit: $limit) { ${TASK_FIELDS} }
  }
`;

export const CREATE_TASK = gql`
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) { ${TASK_FIELDS} }
  }
`;

export const UPDATE_TASK = gql`
  mutation UpdateTask($input: UpdateTaskInput!) {
    updateTask(input: $input) { ${TASK_FIELDS} }
  }
`;

export const SET_TASK_COMPLETED = gql`
  mutation SetTaskCompleted($id: ID!, $completed: Boolean!) {
    setTaskCompleted(id: $id, completed: $completed) {
      id
      completedAt
      isOverdue
    }
  }
`;

export const SET_TASK_STATUS = gql`
  mutation SetTaskStatus($id: ID!, $status: String!) {
    setTaskStatus(id: $id, status: $status) {
      id
      status
      inArbeitSeit
      completedAt
      isOverdue
    }
  }
`;

export const DELETE_TASK = gql`
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id)
  }
`;

export const IMPORTABLE_FIELDS = gql`
  query ImportableFields($entity: ImportEntity!) {
    importableFields(entity: $entity) {
      name
      label
      required
      optionen {
        wert
        label
      }
    }
  }
`;

export const INSPECT_CSV = gql`
  mutation InspectCsv($input: InspectCsvInput!) {
    inspectCsv(input: $input) {
      columns
      rowCount
      sampleRow
      kopfzeile
      vorschau
      spaltenWerte {
        spalte
        werte
        mehr
      }
    }
  }
`;

export const IMPORT_RECORDS = gql`
  mutation ImportRecords($input: ImportInput!) {
    importRecords(input: $input) {
      dryRun
      created
      updated
      rejected
      rejections {
        row
        reason
        zellen
      }
    }
  }
`;

export const ENTITLEMENT = gql`
  query Entitlement {
    entitlement {
      plan
      status
      seats
      usedSeats
      canWrite
      readOnly
      trialDaysLeft
      currentPeriodEnd
      cancelAtPeriodEnd
      billingConfigured
    }
  }
`;

export const BILLING_PLANS = gql`
  query BillingPlans {
    billingPlans {
      plan
      name
      monthlyPricePerSeat
      yearlyPricePerSeat
      maxSeats
      purchasable
    }
  }
`;

export const CREATE_CHECKOUT_SESSION = gql`
  mutation CreateCheckoutSession(
    $plan: BillingPlan!
    $interval: BillingInterval!
    $seats: Int!
  ) {
    createCheckoutSession(plan: $plan, interval: $interval, seats: $seats)
  }
`;

export const CREATE_BILLING_PORTAL_SESSION = gql`
  mutation CreateBillingPortalSession {
    createBillingPortalSession
  }
`;

export const SICHERHEIT = gql`
  query Sicherheit {
    sicherheit {
      massnahmen
      hosting
      sicherung
      unterauftragsverarbeiter
      unterauftragStand
      loeschfristTage
      loeschfristAktiv
      vertragGeprueft
    }
  }
`;

export const LEGAL_ENTITY = gql`
  query LegalEntity {
    legalEntity {
      configured
      companyName
      legalForm
      street
      postalCode
      city
      country
      email
      phone
      representative
      registerEntry
      vatId
    }
  }
`;

export const PRIVACY_FACTS = gql`
  query PrivacyFacts {
    privacyFacts {
      reviewed
      hosting
      privacyContact
      supervisoryAuthority
      billing
      errorReporting
      outgoingMail
      mailboxes
      retentionDays
      retentionEnabled
      protokollAenderungenMonate
      protokollSicherheitMonate
    }
  }
`;

export const DATA_PROCESSING_AGREEMENT = gql`
  query DataProcessingAgreement {
    dataProcessingAgreement {
      title
      reviewed
      processorName
      sections {
        label
        title
        blocks {
          kind
          text
          items
          variable
        }
      }
      annexes {
        label
        title
        blocks {
          kind
          text
          items
          variable
        }
      }
    }
  }
`;

export const ATTACHMENTS = gql`
  query Attachments(
    $companyId: ID
    $contactId: ID
    $dealId: ID
    $quoteId: ID
    $invoiceId: ID
    $taskId: ID
    $noteId: ID
  ) {
    attachments(
      companyId: $companyId
      contactId: $contactId
      dealId: $dealId
      quoteId: $quoteId
      invoiceId: $invoiceId
      taskId: $taskId
      noteId: $noteId
    ) {
      id
      name
      mimeType
      sizeBytes
      createdAt
      uploadedBy {
        id
        firstName
        lastName
      }
    }
  }
`;

export const DELETE_ATTACHMENT = gql`
  mutation DeleteAttachment($id: ID!) {
    deleteAttachment(id: $id)
  }
`;

export const TWO_FACTOR_STATUS = gql`
  query TwoFactorStatus {
    twoFactorStatus {
      enabled
      recoveryCodesLeft
    }
  }
`;

export const BEGIN_TWO_FACTOR = gql`
  mutation BeginTwoFactorSetup {
    beginTwoFactorSetup {
      secret
      url
      qrSvg
    }
  }
`;

export const CONFIRM_TWO_FACTOR = gql`
  mutation ConfirmTwoFactorSetup($code: String!) {
    confirmTwoFactorSetup(code: $code)
  }
`;

export const DISABLE_TWO_FACTOR = gql`
  mutation DisableTwoFactor($code: String!) {
    disableTwoFactor(code: $code)
  }
`;

export const EXPORT_WORKSPACE_DATA = gql`
  query ExportWorkspaceData {
    exportWorkspaceData
  }
`;

export const DELETE_WORKSPACE = gql`
  mutation DeleteWorkspace($confirmationName: String!, $password: String!) {
    deleteWorkspace(
      input: { confirmationName: $confirmationName, password: $password }
    )
  }
`;

const QUOTE_FIELDS = `
  id
  number
  status
  currency
  smallBusiness
  taxExemption
  taxExemptionNote
  recipientVatId
  recipientAddress
  issuedOn
  validUntil
  introText
  closingText
  sentAt
  decidedAt
  decidedByName
  decidedOnline
  publicLink
  company {
    id
    name
  }
  contact {
    id
    firstName
    lastName
  }
  deal {
    id
    name
  }
  lines {
    id
    productId
    position
    name
    articleNumber
    description
    quantity
    unit
    unitPriceCents
    discountPercent
    taxRatePercent
  }
  totals {
    netCents
    taxCents
    grossCents
    taxGroups {
      ratePercent
      netCents
      taxCents
    }
  }
`;

export const QUOTES = gql`
  query Quotes {
    quotes {
      id
      number
      status
      issuedOn
      validUntil
      sentAt
      company {
        id
        name
      }
      totals {
        grossCents
      }
    }
  }
`;

export const QUOTE = gql`
  query Quote($id: ID!) {
    quote(id: $id) { ${QUOTE_FIELDS} }
  }
`;

export const CREATE_QUOTE = gql`
  mutation CreateQuote($input: CreateQuoteInput!) {
    createQuote(input: $input) { ${QUOTE_FIELDS} }
  }
`;

export const UPDATE_QUOTE = gql`
  mutation UpdateQuote($input: UpdateQuoteInput!) {
    updateQuote(input: $input) { ${QUOTE_FIELDS} }
  }
`;

export const SET_QUOTE_LINES = gql`
  mutation SetQuoteLines($input: SetQuoteLinesInput!) {
    setQuoteLines(input: $input) { ${QUOTE_FIELDS} }
  }
`;

export const MARK_QUOTE_SENT = gql`
  mutation MarkQuoteSent($id: ID!) {
    markQuoteSent(id: $id) { ${QUOTE_FIELDS} }
  }
`;

export const DECIDE_QUOTE = gql`
  mutation DecideQuote($id: ID!, $accepted: Boolean!) {
    decideQuote(id: $id, accepted: $accepted) { ${QUOTE_FIELDS} }
  }
`;

export const CREATE_QUOTE_LINK = gql`
  mutation CreateQuoteLink($id: ID!) {
    createQuoteLink(id: $id) { ${QUOTE_FIELDS} }
  }
`;

export const REVOKE_QUOTE_LINK = gql`
  mutation RevokeQuoteLink($id: ID!) {
    revokeQuoteLink(id: $id) { ${QUOTE_FIELDS} }
  }
`;

export const DUPLICATE_QUOTE = gql`
  mutation DuplicateQuote($id: ID!) {
    duplicateQuote(id: $id) { ${QUOTE_FIELDS} }
  }
`;

export const DELETE_QUOTE = gql`
  mutation DeleteQuote($id: ID!) {
    deleteQuote(id: $id)
  }
`;

export const PRODUCTS = gql`
  query Products($includeInactive: Boolean) {
    products(includeInactive: $includeInactive) {
      id
      name
      articleNumber
      description
      unitPriceCents
      unit
      taxRatePercent
      active
    }
  }
`;

export const CREATE_PRODUCT = gql`
  mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
      id
      name
      articleNumber
      description
      unitPriceCents
      unit
      taxRatePercent
      active
    }
  }
`;

export const UPDATE_PRODUCT = gql`
  mutation UpdateProduct($input: UpdateProductInput!) {
    updateProduct(input: $input) {
      id
      name
      articleNumber
      description
      unitPriceCents
      unit
      taxRatePercent
      active
    }
  }
`;

const LETTERHEAD_FIELDS = `
  id
  companyName
  street
  postalCode
  city
  country
  phone
  email
  website
  representative
  registerEntry
  taxNumber
  vatId
  bankName
  iban
  bic
  datevBeraternummer
  datevMandantennummer
  datevKontenrahmen
  smallBusiness
  defaultValidityDays
  defaultIntroText
  defaultClosingText
`;

export const CALENDAR_FEED_URL = gql`
  query CalendarFeedUrl {
    calendarFeedUrl
  }
`;

export const ENABLE_CALENDAR_FEED = gql`
  mutation EnableCalendarFeed($renew: Boolean) {
    enableCalendarFeed(renew: $renew)
  }
`;

export const DISABLE_CALENDAR_FEED = gql`
  mutation DisableCalendarFeed {
    disableCalendarFeed
  }
`;

const KALENDER_VERBINDUNG_FIELDS = `
  id
  anbieter
  serverUrl
  benutzer
  kalenderUrl
  kalenderName
  letzterSyncAm
  letzterFehler
  sichtbarkeit
  fehlerArt
  fehlversuche
  fehlerZeigen
`;

export const KALENDER_VERBINDUNG = gql`
  query KalenderVerbindung {
    kalenderVerbindung { ${KALENDER_VERBINDUNG_FIELDS} }
  }
`;

export const KALENDER_LISTE = gql`
  query KalenderListe {
    kalenderListe {
      url
      name
    }
  }
`;

export const KALENDER_VERBINDEN = gql`
  mutation KalenderVerbinden($input: KalenderVerbindenInput!) {
    kalenderVerbinden(input: $input) {
      verbindung { ${KALENDER_VERBINDUNG_FIELDS} }
      kalender { url name }
    }
  }
`;

export const KALENDER_WAEHLEN = gql`
  mutation KalenderWaehlen($url: String!) {
    kalenderWaehlen(url: $url) { ${KALENDER_VERBINDUNG_FIELDS} }
  }
`;

export const KALENDER_ABGLEICHEN = gql`
  mutation KalenderAbgleichen {
    kalenderAbgleichen { ${KALENDER_VERBINDUNG_FIELDS} }
  }
`;

export const KALENDER_SICHTBARKEIT_SETZEN = gql`
  mutation KalenderSichtbarkeitSetzen($sichtbarkeit: String!) {
    kalenderSichtbarkeitSetzen(sichtbarkeit: $sichtbarkeit) { ${KALENDER_VERBINDUNG_FIELDS} }
  }
`;

export const KALENDER_TRENNEN = gql`
  mutation KalenderTrennen {
    kalenderTrennen
  }
`;

export const TERMIN_EINLADUNG_SENDEN = gql`
  mutation TerminEinladungSenden($id: ID!) {
    terminEinladungSenden(id: $id) {
      id
      eingeladenAm
    }
  }
`;

const PHASEN_FIELDS = `
  stage
  label
  defaultLabel
  probability
  farbe
  ausgeblendet
`;

export const PIPELINES = gql`
  query Pipelines {
    pipelines {
      id
      name
      position
      anzahlGeschaefte
      phasen { ${PHASEN_FIELDS} }
    }
  }
`;

export const CREATE_PIPELINE = gql`
  mutation CreatePipeline($name: String!) {
    createPipeline(name: $name) {
      id
      name
    }
  }
`;

export const RENAME_PIPELINE = gql`
  mutation RenamePipeline($id: ID!, $name: String!) {
    renamePipeline(id: $id, name: $name) {
      id
      name
    }
  }
`;

export const DELETE_PIPELINE = gql`
  mutation DeletePipeline($id: ID!, $verschiebenNach: ID) {
    deletePipeline(id: $id, verschiebenNach: $verschiebenNach)
  }
`;

export const UPDATE_DEAL_STAGES = gql`
  mutation UpdateDealStages($input: [DealStageSettingInput!]!, $pipelineId: ID) {
    updateDealStages(input: $input, pipelineId: $pipelineId) { ${PHASEN_FIELDS} }
  }
`;

export const DEAL_FORECAST = gql`
  query DealForecast($months: Int) {
    dealForecast(months: $months) {
      betraegeVerborgen
      openAmount
      weightedAmount
      months {
        month
        dealCount
        totalAmount
        weightedAmount
      }
    }
  }
`;

export const MAIL_TEMPLATES = gql`
  query MailTemplates {
    mailTemplates {
      id
      name
      subject
      body
    }
  }
`;

export const SAVE_MAIL_TEMPLATE = gql`
  mutation SaveMailTemplate($input: MailTemplateInput!) {
    saveMailTemplate(input: $input) {
      id
      name
      subject
      body
    }
  }
`;

export const DELETE_MAIL_TEMPLATE = gql`
  mutation DeleteMailTemplate($id: ID!) {
    deleteMailTemplate(id: $id)
  }
`;

const WEBHOOK_FIELDS = `
  id
  url
  events
  active
  lastStatus
  lastError
  lastDeliveredAt
  failureCount
`;

export const WEBHOOKS = gql`
  query Webhooks {
    webhooks { ${WEBHOOK_FIELDS} }
  }
`;

export const WEBHOOK_EVENTS = gql`
  query WebhookEvents {
    webhookEvents
  }
`;

export const CREATE_WEBHOOK = gql`
  mutation CreateWebhook($input: CreateWebhookInput!) {
    createWebhook(input: $input) {
      secret
      webhook { ${WEBHOOK_FIELDS} }
    }
  }
`;

export const SET_WEBHOOK_ACTIVE = gql`
  mutation SetWebhookActive($id: ID!, $active: Boolean!) {
    setWebhookActive(id: $id, active: $active) { ${WEBHOOK_FIELDS} }
  }
`;

export const TEST_WEBHOOK = gql`
  mutation TestWebhook($id: ID!) {
    testWebhook(id: $id) { ${WEBHOOK_FIELDS} }
  }
`;

export const DELETE_WEBHOOK = gql`
  mutation DeleteWebhook($id: ID!) {
    deleteWebhook(id: $id)
  }
`;

export const DATEV_LUECKEN = gql`
  query DatevLuecken {
    datevLuecken
  }
`;

export const LETTERHEAD = gql`
  query Letterhead {
    letterhead { ${LETTERHEAD_FIELDS} }
    letterheadGaps {
      field
      label
    }
  }
`;

export const UPDATE_LETTERHEAD = gql`
  mutation UpdateLetterhead($input: UpdateLetterheadInput!) {
    updateLetterhead(input: $input) { ${LETTERHEAD_FIELDS} }
  }
`;

export const LETTERHEAD_LOGO = gql`
  query LetterheadLogo {
    letterhead {
      id
      logoDataUrl
    }
  }
`;

export const REMOVE_LETTERHEAD_LOGO = gql`
  mutation RemoveLetterheadLogo {
    removeLetterheadLogo {
      id
      logoDataUrl
    }
  }
`;

export const MEINE_FAVORITEN = gql`
  query MeineFavoriten {
    meineFavoriten {
      art
      datensatzId
      titel
      createdAt
    }
  }
`;

export const LIVE_TICKET = gql`
  mutation LiveTicket {
    liveTicket
  }
`;

export const FAVORIT_UMSCHALTEN = gql`
  mutation FavoritUmschalten($art: FavoritArt!, $datensatzId: ID!) {
    favoritUmschalten(art: $art, datensatzId: $datensatzId)
  }
`;

export const RECORD_ACTIVITY = gql`
  query RecordActivity($entityId: ID!, $limit: Int) {
    auditLog(entityId: $entityId, limit: $limit) {
      id
      action
      actorName
      changes
      createdAt
      herkunft
    }
  }
`;

const ROLE_FIELDS = `
  id
  name
  description
  templateKey
  everything
  permissions
  sichtbarkeit { company contact deal }
  feldrechte { feld recht }
  isSystem
  memberCount
`;

export const ROLES = gql`
  query Roles {
    roles { ${ROLE_FIELDS} }
    myPermissions {
      everything
      permissions
      feldrechte { feld recht }
    }
  }
`;

export const MY_PERMISSIONS = gql`
  query MyPermissions {
    myPermissions {
      everything
      permissions
      feldrechte {
        feld
        recht
      }
    }
  }
`;

export const CREATE_ROLE = gql`
  mutation CreateRole($input: CreateRoleInput!) {
    createRole(input: $input) { ${ROLE_FIELDS} }
  }
`;

export const UPDATE_ROLE = gql`
  mutation UpdateRole($input: UpdateRoleInput!) {
    updateRole(input: $input) { ${ROLE_FIELDS} }
  }
`;

export const DELETE_ROLE = gql`
  mutation DeleteRole($id: ID!) {
    deleteRole(id: $id)
  }
`;

export const ASSIGN_ROLE = gql`
  mutation AssignRole($userId: ID!, $roleId: ID!) {
    assignRole(userId: $userId, roleId: $roleId) {
      id
      roleId
      roleRef {
        id
        name
      }
    }
  }
`;

const MAILBOX_FIELDS = `
  id
  art
  bezeichnung
  haupt
  getrennt
  darfVerwalten
  host
  port
  secure
  username
  folder
  smtpHost
  smtpPort
  smtpSecure
  active
  lastSyncedAt
  lastError
  messageCount
  sichtbarkeit
  gesendetOrdner
  oauthAnbieter
  ausschlussIntern
  ausschlussMassenpost
  ausschlussGruppen
  ausschlussFreemail
  ausschlussGmailKategorien
  istGmail
  fehlerArt
  fehlversuche
  fehlerZeigen
  aliase
  anhaengeAutomatisch
  anhaengeBisMb
`;

export const ABSENDER_PRUEFUNG = gql`
  query AbsenderPruefung($frisch: Boolean) {
    absenderPruefung(frisch: $frisch) {
      domain
      spf
      dmarc
      ampel
      hinweise
      geprueftAm
    }
  }
`;

export const OAUTH_ANBIETER = gql`
  query OAuthAnbieter {
    oauthAnbieter
  }
`;

export const OAUTH_STARTEN = gql`
  mutation OAuthStarten(
    $anbieter: String!
    $zweck: String!
    $postfachArt: String
  ) {
    oauthStarten(anbieter: $anbieter, zweck: $zweck, postfachArt: $postfachArt)
  }
`;

export const MY_MAILBOX = gql`
  query MyMailbox {
    myMailbox { ${MAILBOX_FIELDS} }
  }
`;

export const CONNECT_MAILBOX = gql`
  mutation ConnectMailbox($input: ConnectMailboxInput!) {
    connectMailbox(input: $input) { ${MAILBOX_FIELDS} }
  }
`;

export const POSTFAECHER = gql`
  query Postfaecher {
    postfaecher {
      ${MAILBOX_FIELDS}
      mitglieder
    }
  }
`;

export const DISCONNECT_MAILBOX = gql`
  mutation DisconnectMailbox($behalten: Boolean, $mailboxId: ID) {
    disconnectMailbox(behalten: $behalten, mailboxId: $mailboxId)
  }
`;

export const SET_MAIL_SICHTBARKEIT = gql`
  mutation SetMailSichtbarkeit($sichtbarkeit: String!, $mailboxId: ID) {
    setMailSichtbarkeit(sichtbarkeit: $sichtbarkeit, mailboxId: $mailboxId) { ${MAILBOX_FIELDS} }
  }
`;

export const SET_POSTFACH_EINSTELLUNGEN = gql`
  mutation SetPostfachEinstellungen(
    $input: PostfachEinstellungenInput!
    $mailboxId: ID
  ) {
    setPostfachEinstellungen(input: $input, mailboxId: $mailboxId) { ${MAILBOX_FIELDS} }
  }
`;

export const SET_POSTFACH_MITGLIEDER = gql`
  mutation SetPostfachMitglieder($mailboxId: ID!, $userIds: [ID!]!) {
    setPostfachMitglieder(mailboxId: $mailboxId, userIds: $userIds) {
      id
      mitglieder
    }
  }
`;

export const SET_HAUPTPOSTFACH = gql`
  mutation SetHauptpostfach($mailboxId: ID!) {
    setHauptpostfach(mailboxId: $mailboxId) { ${MAILBOX_FIELDS} }
  }
`;

export const POSTFACH_GESPRAECHE = gql`
  query PostfachGespraeche($mailboxId: ID!, $filter: String) {
    postfachGespraeche(mailboxId: $mailboxId, filter: $filter) {
      threadKey
      nachrichtId
      betreff
      vonAdresse
      vonName
      ausschnitt
      ausgehend
      zuletzt
      anzahl
      offen
      zugewiesenAnId
      contactId
      companyId
    }
  }
`;

export const POSTFACH_ZUWEISEN = gql`
  mutation PostfachZuweisen($mailboxId: ID!, $threadKey: String!, $userId: ID) {
    postfachZuweisen(
      mailboxId: $mailboxId
      threadKey: $threadKey
      userId: $userId
    )
  }
`;

export const POSTFACH_ERLEDIGT = gql`
  mutation PostfachErledigt(
    $mailboxId: ID!
    $threadKey: String!
    $erledigt: Boolean!
  ) {
    postfachErledigt(
      mailboxId: $mailboxId
      threadKey: $threadKey
      erledigt: $erledigt
    )
  }
`;

const MAIL_INHALT_FIELDS = `
  id
  inhalt
  zitat
  inhaltVerborgen
  anhaenge {
    index
    name
    mimeType
    groesse
    gespeichertId
  }
`;

export const MAIL_INHALTE = gql`
  query MailInhalte($ids: [ID!]!) {
    mailInhalte(ids: $ids) { ${MAIL_INHALT_FIELDS} }
  }
`;

export const MAIL_ANHANG_SPEICHERN = gql`
  mutation MailAnhangSpeichern($nachrichtId: ID!, $index: Int!) {
    mailAnhangSpeichern(nachrichtId: $nachrichtId, index: $index) { ${MAIL_INHALT_FIELDS} }
  }
`;

export const KONTAKT_VORSCHLAEGE = gql`
  query KontaktVorschlaege {
    kontaktVorschlaege {
      adresse
      vorname
      nachname
      firmaId
      firmaVorschlag
      domain
      anzahl
      zuletzt
    }
  }
`;

export const UNZUSTELLBARE_ADRESSEN = gql`
  query UnzustellbareAdressen($adressen: [String!]!) {
    unzustellbareAdressen(adressen: $adressen)
  }
`;

export const SYNC_MAILBOX = gql`
  mutation SyncMailbox($mailboxId: ID) {
    syncMailbox(mailboxId: $mailboxId) {
      stored
      matched
      unfiled
    }
  }
`;

const MAIL_MESSAGE_FIELDS = `
  id
  subject
  snippet
  fromAddress
  fromName
  toAddresses
  threadKey
  outgoing
  sentAt
  mailboxId
  inhaltVerborgen
  anhangAnzahl
`;

export const POSTFACH_GESPRAECH = gql`
  query PostfachGespraech($mailboxId: ID!, $threadKey: String!) {
    postfachGespraech(mailboxId: $mailboxId, threadKey: $threadKey) { ${MAIL_MESSAGE_FIELDS} }
  }
`;

export const CONTACT_MESSAGES = gql`
  query ContactMessages($contactId: ID!) {
    contactMessages(contactId: $contactId) { ${MAIL_MESSAGE_FIELDS} }
  }
`;

export const COMPANY_MESSAGES = gql`
  query CompanyMessages($companyId: ID!) {
    companyMessages(companyId: $companyId) { ${MAIL_MESSAGE_FIELDS} }
  }
`;

export const DEAL_MESSAGES = gql`
  query DealMessages($dealId: ID!) {
    dealMessages(dealId: $dealId) { ${MAIL_MESSAGE_FIELDS} }
  }
`;

export const MAIL_SPERREN = gql`
  query MailSperren {
    mailSperren {
      id
      eintrag
      createdAt
    }
  }
`;

export const ADD_MAIL_SPERRE = gql`
  mutation AddMailSperre($input: AddMailSperreInput!) {
    addMailSperre(input: $input) {
      id
      eintrag
      createdAt
    }
  }
`;

export const REMOVE_MAIL_SPERRE = gql`
  mutation RemoveMailSperre($id: ID!) {
    removeMailSperre(id: $id)
  }
`;

export const SEND_MAIL = gql`
  mutation SendMail($input: SendMailInput!) {
    sendMail(input: $input) { ${MAIL_MESSAGE_FIELDS} }
  }
`;

const INVOICE_LINE_FIELDS = `
  id
  position
  name
  articleNumber
  description
  quantity
  unit
  unitPriceCents
  discountPercent
  taxRatePercent
`;

const INVOICE_FIELDS = `
  id
  number
  status
  quoteId
  correctsInvoiceId
  companyId
  company { id name }
  contactId
  contact { id firstName lastName }
  recipientAddress
  buyerReference
  issuedOn
  serviceDate
  dueOn
  paymentTermDays
  introText
  closingText
  smallBusiness
  taxExemption
  taxExemptionNote
  recipientVatId
  paidAt
  cancelledAt
  lines { ${INVOICE_LINE_FIELDS} }
  totals {
    netCents
    taxCents
    grossCents
    taxGroups { ratePercent netCents taxCents }
  }
`;

const INVOICE_SERIES_FIELDS = `
  id
  interval
  nextRunOn
  endOn
  active
  sourceInvoiceId
`;

export const INVOICE_SERIES_LIST = gql`
  query InvoiceSeriesList {
    invoiceSeriesList {
      ${INVOICE_SERIES_FIELDS}
      sourceInvoice {
        id
        number
        company { id name }
        totals { grossCents }
      }
    }
  }
`;

export const CREATE_INVOICE_SERIES = gql`
  mutation CreateInvoiceSeries($input: CreateInvoiceSeriesInput!) {
    createInvoiceSeries(input: $input) { ${INVOICE_SERIES_FIELDS} }
  }
`;

export const END_INVOICE_SERIES = gql`
  mutation EndInvoiceSeries($id: ID!) {
    endInvoiceSeries(id: $id)
  }
`;

const BUCHHALTUNG_UEBERTRAGUNG_FIELDS = `
  id
  invoiceId
  anbieter
  status
  externeBelegId
  zuPruefen
  versuche
  letzterFehler
  fehlerArt
  uebertragenAm
  bezahltGemeldet
  updatedAt
`;

const BUCHHALTUNG_VERBINDUNG_FIELDS = `
  id
  anbieter
  kontoName
  automatisch
  zahlungenAbgleichen
  anmeldungFehler
  anmeldungFehlerAm
  fehlerZeigen
  createdAt
`;

export const BUCHHALTUNG_VERBINDUNG = gql`
  query BuchhaltungVerbindung {
    buchhaltungVerbindung { ${BUCHHALTUNG_VERBINDUNG_FIELDS} }
  }
`;

export const BUCHHALTUNG_STAND = gql`
  query BuchhaltungStand {
    buchhaltungVerbindung {
      ${BUCHHALTUNG_VERBINDUNG_FIELDS}
      wartend
      fehlerhaft
      nichtUebertragen
    }
  }
`;

export const BUCHHALTUNG_VERBINDEN = gql`
  mutation BuchhaltungVerbinden($input: BuchhaltungVerbindenInput!) {
    buchhaltungVerbinden(input: $input) { ${BUCHHALTUNG_VERBINDUNG_FIELDS} }
  }
`;

export const BUCHHALTUNG_EINSTELLEN = gql`
  mutation BuchhaltungEinstellen($input: BuchhaltungEinstellungenInput!) {
    buchhaltungEinstellen(input: $input) { ${BUCHHALTUNG_VERBINDUNG_FIELDS} }
  }
`;

export const BUCHHALTUNG_TRENNEN = gql`
  mutation BuchhaltungTrennen {
    buchhaltungTrennen
  }
`;

export const RECHNUNG_AN_BUCHHALTUNG = gql`
  mutation RechnungAnBuchhaltung($invoiceId: ID!) {
    rechnungAnBuchhaltung(invoiceId: $invoiceId) { ${BUCHHALTUNG_UEBERTRAGUNG_FIELDS} }
  }
`;

export const OFFENE_AN_BUCHHALTUNG = gql`
  mutation OffeneAnBuchhaltung {
    offeneAnBuchhaltung
  }
`;

export const INVOICES = gql`
  query Invoices {
    invoices { ${INVOICE_FIELDS} }
  }
`;

export const INVOICE = gql`
  query Invoice($id: ID!) {
    invoice(id: $id) {
      ${INVOICE_FIELDS}
      xrechnungLuecken
      zugferdLuecken
      seriesId
      templateSeries { ${INVOICE_SERIES_FIELDS} }
      buchhaltung { ${BUCHHALTUNG_UEBERTRAGUNG_FIELDS} }
    }
    invoiceGaps(id: $id) {
      field
      label
    }
  }
`;

export const INVOICES_FOR_QUOTE = gql`
  query InvoicesForQuote($quoteId: ID!) {
    invoicesForQuote(quoteId: $quoteId) { ${INVOICE_FIELDS} }
  }
`;

export const INVOICE_NUMBER_GAPS = gql`
  query InvoiceNumberGaps {
    invoiceNumberGaps
  }
`;

export const CREATE_INVOICE_FROM_QUOTE = gql`
  mutation CreateInvoiceFromQuote($quoteId: ID!) {
    createInvoiceFromQuote(quoteId: $quoteId) { ${INVOICE_FIELDS} }
  }
`;

export const CREATE_INVOICE = gql`
  mutation CreateInvoice($input: CreateInvoiceInputDto!) {
    createInvoice(input: $input) { ${INVOICE_FIELDS} }
  }
`;

export const UPDATE_INVOICE = gql`
  mutation UpdateInvoice($input: UpdateInvoiceInputDto!) {
    updateInvoice(input: $input) { ${INVOICE_FIELDS} }
  }
`;

export const SET_INVOICE_LINES = gql`
  mutation SetInvoiceLines($input: SetInvoiceLinesInput!) {
    setInvoiceLines(input: $input) { ${INVOICE_FIELDS} }
  }
`;

export const ISSUE_INVOICE = gql`
  mutation IssueInvoice($id: ID!) {
    issueInvoice(id: $id) { ${INVOICE_FIELDS} }
  }
`;

export const MARK_INVOICE_PAID = gql`
  mutation MarkInvoicePaid($id: ID!, $paidOn: String) {
    markInvoicePaid(id: $id, paidOn: $paidOn) { ${INVOICE_FIELDS} }
  }
`;

export const CANCEL_INVOICE = gql`
  mutation CancelInvoice($id: ID!) {
    cancelInvoice(id: $id) { ${INVOICE_FIELDS} }
  }
`;

export const DELETE_INVOICE = gql`
  mutation DeleteInvoice($id: ID!) {
    deleteInvoice(id: $id)
  }
`;

export const OPEN_ITEMS = gql`
  query OpenItems {
    openItems {
      invoice {
        id
        number
        issuedOn
        dueOn
        company {
          id
          name
        }
        totals {
          grossCents
        }
      }
      level
      nextStep
      nextStepOn
      daysOverdue
      inDefault
      interestCents
      lateFeeCents
      recipientEmail
    }
  }
`;

export const REMINDER_PREVIEW = gql`
  query ReminderPreview($invoiceId: ID!) {
    reminderPreview(invoiceId: $invoiceId) {
      level
      subject
      body
      to
    }
  }
`;

export const INVOICE_REMINDERS = gql`
  query InvoiceReminders($invoiceId: ID!) {
    invoiceReminders(invoiceId: $invoiceId) {
      id
      level
      sentOn
      sentTo
      daysOverdue
      interestCents
      lateFeeCents
    }
  }
`;

export const SEND_INVOICE_REMINDER = gql`
  mutation SendInvoiceReminder($invoiceId: ID!) {
    sendInvoiceReminder(invoiceId: $invoiceId) {
      id
      level
      sentOn
    }
  }
`;

export const MY_TASK_DIGEST = gql`
  query MyTaskDigest {
    myTaskDigest {
      subject
      body
    }
  }
`;

export const SET_BASE_INTEREST_RATE = gql`
  mutation SetBaseInterestRate($percent: Float) {
    setBaseInterestRate(percent: $percent) {
      id
      baseInterestRatePercent
    }
  }
`;

export const SET_TASK_DIGEST = gql`
  mutation SetTaskDigest($enabled: Boolean!) {
    setTaskDigest(enabled: $enabled) {
      id
      taskDigest
    }
  }
`;

export const SET_ERWAEHNUNG_MAIL = gql`
  mutation SetErwaehnungMail($enabled: Boolean!) {
    setErwaehnungMail(enabled: $enabled) {
      id
      erwaehnungMail
    }
  }
`;

export const UNGELESENE_BENACHRICHTIGUNGEN = gql`
  query UngeleseneBenachrichtigungen {
    ungeleseneBenachrichtigungen
  }
`;

export const BENACHRICHTIGUNGEN = gql`
  query Benachrichtigungen {
    benachrichtigungen(limit: 20) {
      id
      art
      wo
      von
      erstelltAm
      gelesen
      sichtbar
      auszug
      akte
      pfad
    }
  }
`;

export const BENACHRICHTIGUNG_GELESEN = gql`
  mutation BenachrichtigungGelesen($id: ID) {
    benachrichtigungGelesen(id: $id)
  }
`;

const APPOINTMENT_FIELDS = `
  id
  seriesId
  occurrenceOn
  serieId
  serieDatum
  title
  description
  location
  videoLink
  startDate
  startTime
  endDate
  endTime
  minutes
  allDay
  ownerId
  ownerName
  remindMinutesBefore
  recurrence
  recurrenceText
  cancelledAt
  quelle
  privat
  geschwaerzt
  eingeladenAm
  attendeeSummary
  attendees {
    id
    name
    email
    status
    statusLabel
    contactId
    userId
  }
  company { id name }
  contact { id firstName lastName }
  deal { id name }
`;

export const APPOINTMENTS = gql`
  query Appointments($from: String!, $to: String!, $ownerId: ID, $includeCancelled: Boolean) {
    appointments(from: $from, to: $to, ownerId: $ownerId, includeCancelled: $includeCancelled) {
      ${APPOINTMENT_FIELDS}
    }
  }
`;

export const APPOINTMENT_CONFLICTS = gql`
  query AppointmentConflicts(
    $startDate: String!
    $startTime: String!
    $endDate: String!
    $endTime: String!
    $ownerId: ID
    $exceptId: ID
  ) {
    appointmentConflicts(
      startDate: $startDate
      startTime: $startTime
      endDate: $endDate
      endTime: $endTime
      ownerId: $ownerId
      exceptId: $exceptId
    ) {
      minutes
      appointment {
        id
        title
        geschwaerzt
        startTime
        endTime
        startDate
      }
    }
  }
`;

export const CREATE_APPOINTMENT = gql`
  mutation CreateAppointment($input: CreateAppointmentInput!) {
    createAppointment(input: $input) {
      ${APPOINTMENT_FIELDS}
    }
  }
`;

export const UPDATE_APPOINTMENT = gql`
  mutation UpdateAppointment($input: UpdateAppointmentInput!) {
    updateAppointment(input: $input) {
      ${APPOINTMENT_FIELDS}
    }
  }
`;

export const SET_ATTENDEE_STATUS = gql`
  mutation SetAttendeeStatus($attendeeId: ID!, $status: AttendeeStatus!) {
    setAttendeeStatus(attendeeId: $attendeeId, status: $status) {
      id
      status
      statusLabel
    }
  }
`;

export const CONTACT_OPTIONS = gql`
  query ContactOptions {
    contacts(limit: 200, sortField: "lastName", sortDirection: ASC) {
      items {
        id
        firstName
        lastName
        email
      }
    }
  }
`;

export const CANCEL_APPOINTMENT = gql`
  mutation CancelAppointment($id: ID!, $scope: AppointmentScope) {
    cancelAppointment(id: $id, scope: $scope) {
      ${APPOINTMENT_FIELDS}
    }
  }
`;

export const REINSTATE_APPOINTMENT = gql`
  mutation ReinstateAppointment($id: ID!) {
    reinstateAppointment(id: $id) {
      ${APPOINTMENT_FIELDS}
    }
  }
`;

export const DELETE_APPOINTMENT = gql`
  mutation DeleteAppointment($id: ID!, $scope: AppointmentScope) {
    deleteAppointment(id: $id, scope: $scope)
  }
`;

const API_KEY_FIELDS = `
  id
  name
  anzeige
  permissions
  lastUsedAt
  revokedAt
  expiresAt
  createdAt
  createdByName
  schreibmodus
`;

export const API_KEYS = gql`
  query ApiKeys {
    apiKeys { ${API_KEY_FIELDS} }
    myPermissions {
      everything
      permissions
      feldrechte { feld recht }
    }
  }
`;

export const CREATE_API_KEY = gql`
  mutation CreateApiKey($input: CreateApiKeyInput!) {
    createApiKey(input: $input) {
      token
      apiKey { ${API_KEY_FIELDS} }
    }
  }
`;

export const SET_API_KEY_SCHREIBMODUS = gql`
  mutation SetApiKeySchreibmodus($id: ID!, $schreibmodus: String!) {
    setApiKeySchreibmodus(id: $id, schreibmodus: $schreibmodus) { ${API_KEY_FIELDS} }
  }
`;

export const REVOKE_API_KEY = gql`
  mutation RevokeApiKey($id: ID!) {
    revokeApiKey(id: $id) { ${API_KEY_FIELDS} }
  }
`;

const WEB_FORM_FIELDS = `
  id
  title
  intro
  thankYou
  privacyUrl
  createDeal
  active
`;

export const WEB_FORM = gql`
  query WebForm {
    webForm { ${WEB_FORM_FIELDS} }
  }
`;

export const SAVE_WEB_FORM = gql`
  mutation SaveWebForm($input: WebFormInput!) {
    saveWebForm(input: $input) { ${WEB_FORM_FIELDS} }
  }
`;

export const ICH_BIN_BETREIBER = gql`
  query IchBinBetreiber {
    ichBinBetreiber
  }
`;

export const BETRIEBS_UEBERSICHT = gql`
  query BetriebsUebersicht {
    betriebsUebersicht {
      zahlen {
        konten
        bestaetigt
        neuDieseWoche
        aktivDieseWoche
        mitZweiFaktor
        offeneEinladungen
        arbeitsbereiche
        zahlend
        inTestphase
      }
      konten {
        id
        email
        name
        bestaetigt
        zweiFaktor
        bereiche
        bereichNamen
        zuletztAktiv
        angelegt
      }
      bereiche {
        id
        name
        mitglieder
        inhaber
        firmen
        kontakte
        geschaefte
        angebote
        rechnungen
        speicherBytes
        zuletztAktiv
        plan
        status
        testphaseBis
        laeuftBis
        angelegt
      }
    }
  }
`;

export const BETRIEB_KONTO = gql`
  query BetriebKonto($id: ID!) {
    betriebKonto(id: $id) {
      id
      email
      name
      bestaetigt
      zweiFaktor
      zuletztGesehen
      angelegt
      anmeldungen
      anmeldungen30
      nutzung {
        bereich
        angesehen
        geaendert
        tage
        zuletzt
      }
      tage {
        tag
        anzahl
      }
      aenderungen {
        aktion
        art
        bereich
        wann
      }
    }
  }
`;

export const VERLUSTGRUENDE = gql`
  query Verlustgruende {
    verlustgruende
  }
`;

export const ANZAHL_RUHENDE = gql`
  query AnzahlRuhendeGeschaefte($nurMeine: Boolean) {
    anzahlRuhendeGeschaefte(nurMeine: $nurMeine)
  }
`;

export const ZWEI_FAKTOR_VERLANGT = gql`
  query ZweiFaktorVerlangt {
    zweiFaktorVerlangt
  }
`;

export const LEERLAUF = gql`
  query Leerlauf {
    myWorkspaces {
      id
      workspace {
        id
        leerlaufMinuten
      }
    }
  }
`;

export const SET_LEERLAUF = gql`
  mutation SetLeerlauf($minuten: Int) {
    setLeerlauf(minuten: $minuten) {
      id
      leerlaufMinuten
    }
  }
`;

export const OBJEKT_BEZEICHNUNGEN = gql`
  query ObjektBezeichnungen {
    objektBezeichnungen {
      art
      einzahl
      mehrzahl
      genus
      istStandard
      standardEinzahl
      standardMehrzahl
    }
  }
`;

export const SETZE_OBJEKT_BEZEICHNUNG = gql`
  mutation SetzeObjektBezeichnung($input: ObjektBezeichnungInput!) {
    setzeObjektBezeichnung(input: $input) {
      art
      einzahl
      mehrzahl
      genus
      istStandard
      standardEinzahl
      standardMehrzahl
    }
  }
`;

export const SETZE_OBJEKT_BEZEICHNUNG_ZURUECK = gql`
  mutation SetzeObjektBezeichnungZurueck($art: ObjektArt) {
    setzeObjektBezeichnungZurueck(art: $art) {
      art
      einzahl
      mehrzahl
      genus
      istStandard
      standardEinzahl
      standardMehrzahl
    }
  }
`;

export const EINLADUNGS_DOMAINS = gql`
  query EinladungsDomains {
    myWorkspaces {
      id
      workspace {
        id
        einladungsDomains
      }
    }
  }
`;

export const SET_EINLADUNGS_DOMAINS = gql`
  mutation SetEinladungsDomains($domains: [String!]!) {
    setEinladungsDomains(domains: $domains) {
      id
      einladungsDomains
    }
  }
`;

export const SET_ZWEI_FAKTOR_PFLICHT = gql`
  mutation SetZweiFaktorPflicht($an: Boolean!) {
    setZweiFaktorPflicht(an: $an) {
      id
      zweiFaktorPflicht
    }
  }
`;

export const PROFIL = gql`
  query Profil {
    me {
      id
      firstName
      lastName
      email
      funktion
      durchwahl
      mailSignatur
      passwortGesetzt
      emailVerifiedAt
    }
  }
`;

export const PROFIL_AENDERN = gql`
  mutation ProfilAendern($input: ProfilInput!) {
    profilAendern(input: $input) {
      id
      firstName
      lastName
      funktion
      durchwahl
      mailSignatur
    }
  }
`;

export const PASSWORT_AENDERN = gql`
  mutation PasswortAendern($input: PasswortAendernInput!) {
    passwortAendern(input: $input)
  }
`;

export const AUSWERTUNG = gql`
  query Auswertung(
    $von: String!
    $bis: String!
    $ownerId: ID
    $pipelineId: ID
  ) {
    auswertung(
      von: $von
      bis: $bis
      ownerId: $ownerId
      pipelineId: $pipelineId
    ) {
      von
      bis
      gewonnenAnzahl
      gewonnenSumme
      verlorenAnzahl
      verlorenSumme
      abschlussquote
      durchschnittWert
      durchschnittTage
      neueGeschaefte
      monate {
        monat
        gewonnenAnzahl
        gewonnenSumme
        verlorenAnzahl
        verlorenSumme
      }
      verkaeufer {
        ownerId
        name
        offenAnzahl
        offenSumme
        gewonnenAnzahl
        gewonnenSumme
        verlorenAnzahl
        quote
      }
      verlustgruende {
        grund
        anzahl
        summe
      }
      verweildauer {
        phase
        anzahl
        tage
      }
      betraegeVerborgen
    }
  }
`;
const AUTOMATION_FIELDS = `
  id
  name
  aktiv
  ausloeser
  phase
  aktion
  titel
  faelligInTagen
  zustaendigUserId
  reihumUserIds
  bedingungen { key operator value }
  ruhendTage
  verzoegerungTage
  feldKey
  feldWert
  mailAn
  mailText
  vorlageId
  art
  zeitplan { rhythmus uhrzeit wochentag monatstag }
  naechsterLauf
  eingangEingerichtet
  eingangSigniert
  schritte {
    aktion
    titel
    faelligInTagen
    zustaendigUserId
    reihumUserIds
    feldKey
    feldWert
    mailAn
    mailText
    vorlageId
    zielSchritt
    suchArt
    suchFeld
    suchVergleich
    suchWert
    upsertArt
    upsertWerte { feld wert }
    terminInTagen
    terminUhrzeit
    terminDauer
    terminOrt
    httpMethode
    httpUrl
    httpKoepfe
    httpRumpf
    mailAlsEntwurf
    kanalDienst
    kanalUrlAnzeige
    kanalText
    kanalLink
  }
  createdAt
`;

export const AUTOMATIONEN = gql`
  query Automationen {
    automationen { ${AUTOMATION_FIELDS} }
  }
`;

export const CREATE_AUTOMATION = gql`
  mutation CreateAutomation($input: AutomationInput!) {
    createAutomation(input: $input) { ${AUTOMATION_FIELDS} }
  }
`;

export const UPDATE_AUTOMATION = gql`
  mutation UpdateAutomation($id: ID!, $input: AutomationInput!) {
    updateAutomation(id: $id, input: $input) { ${AUTOMATION_FIELDS} }
  }
`;

export const SET_AUTOMATION_AKTIV = gql`
  mutation SetAutomationAktiv($id: ID!, $aktiv: Boolean!) {
    setAutomationAktiv(id: $id, aktiv: $aktiv) {
      id
      aktiv
    }
  }
`;

const AUSFUEHRUNG_FELDER = `
  id
  zielArt
  zielId
  status
  grund
  testlauf
  faelligAm
  erledigtAm
  createdAt
  schritte { nr aktion status grund eingabe ausgabe }
`;

export const AUTOMATION_PROTOKOLL = gql`
  query AutomationProtokoll($automationId: ID!) {
    automationProtokoll(automationId: $automationId) {
      ${AUSFUEHRUNG_FELDER}
    }
  }
`;

export const AUTOMATION_TESTEN = gql`
  mutation AutomationTesten($id: ID!, $beispiel: String) {
    automationTesten(id: $id, beispiel: $beispiel) {
      ${AUSFUEHRUNG_FELDER}
    }
  }
`;

export const AUTOMATION_LAUF_WIEDERHOLEN = gql`
  mutation AutomationLaufWiederholen($ausfuehrungId: ID!) {
    automationLaufWiederholen(ausfuehrungId: $ausfuehrungId) {
      ${AUSFUEHRUNG_FELDER}
    }
  }
`;

export const AUTOMATION_LAUF_ABBRECHEN = gql`
  mutation AutomationLaufAbbrechen($ausfuehrungId: ID!) {
    automationLaufAbbrechen(ausfuehrungId: $ausfuehrungId)
  }
`;

export const AUTOMATION_EINGANG_ERNEUERN = gql`
  mutation AutomationEingangErneuern($id: ID!, $mitSignatur: Boolean!) {
    automationEingangErneuern(id: $id, mitSignatur: $mitSignatur) {
      url
      geheimnis
    }
  }
`;

export const AUTOMATION_KNOEPFE = gql`
  query AutomationKnoepfe($art: String!) {
    automationKnoepfe(art: $art) {
      id
      name
    }
  }
`;

export const AUTOMATION_STARTEN = gql`
  mutation AutomationStarten($id: ID!, $zielId: ID!) {
    automationStarten(id: $id, zielId: $zielId) {
      id
      status
      grund
    }
  }
`;

export const DELETE_AUTOMATION = gql`
  mutation DeleteAutomation($id: ID!) {
    deleteAutomation(id: $id)
  }
`;

export const AVV_STAND = gql`
  query AvvStand {
    avvStand {
      aktuell
      geprueft
      auftraggeber
      annahme {
        id
        angenommenVon
        angenommenAm
        auftraggeber
        fassung
      }
    }
  }
`;

export const AVV_ANNEHMEN = gql`
  mutation AvvAnnehmen {
    avvAnnehmen {
      id
    }
  }
`;

export const NOTIZ_SUCHE = gql`
  query NotizSuche($text: String!, $limit: Int) {
    notizSuche(text: $text, limit: $limit) {
      id
      body
      createdAt
      authorName
      companyId
      contactId
      dealId
    }
  }
`;

export const SUCHE = gql`
  query Suche($text: String!, $limit: Int) {
    suche(text: $text, limit: $limit) {
      art
      rang
      firma {
        id
        name
        industry
        city
      }
      kontakt {
        id
        firstName
        lastName
        jobTitle
        company {
          id
          name
        }
      }
      geschaeft {
        id
        name
        stage
        amount
        currency
        company {
          id
          name
        }
      }
    }
  }
`;

export const EMAIL_AENDERN_ANFRAGEN = gql`
  mutation EmailAendernAnfragen($input: EmailAendernInput!) {
    emailAendernAnfragen(input: $input)
  }
`;

export const EMAIL_AENDERN_BESTAETIGEN = gql`
  mutation EmailAendernBestaetigen($token: String!) {
    emailAendernBestaetigen(token: $token)
  }
`;

export const KONTO_LOESCHEN = gql`
  mutation KontoLoeschen($passwort: String!) {
    kontoLoeschen(passwort: $passwort)
  }
`;

export const ZWEI_FAKTOR_ZURUECKSETZEN = gql`
  mutation ZweiFaktorZuruecksetzen($userId: ID!) {
    zweiFaktorZuruecksetzen(userId: $userId)
  }
`;

export const MAIL_SUCHE = gql`
  query MailSuche($text: String!, $limit: Int) {
    mailSuche(text: $text, limit: $limit) {
      id
      subject
      fromAddress
      fromName
      sentAt
      contactId
      companyId
    }
  }
`;

const KAMPAGNEN_FELDER = `
  id
  name
  betreff
  text
  thema
  status
  gestartetAm
  beendetAm
  createdAt
  geplant
  gesendet
  uebersprungen
  fehler
`;

export const KAMPAGNEN = gql`
  query Kampagnen {
    kampagnen { ${KAMPAGNEN_FELDER} }
  }
`;

export const KAMPAGNE = gql`
  query Kampagne($id: ID!) {
    kampagne(id: $id) { ${KAMPAGNEN_FELDER} }
  }
`;

export const KAMPAGNEN_EMPFAENGER = gql`
  query KampagnenEmpfaenger($id: ID!, $status: String) {
    kampagnenEmpfaenger(id: $id, status: $status) {
      id
      contactId
      email
      vorname
      nachname
      firma
      status
      grund
      gesendetAm
    }
  }
`;

export const KAMPAGNEN_VORSCHAU = gql`
  query KampagnenVorschau($id: ID!) {
    kampagnenVorschau(id: $id) {
      an
      betreff
      text
    }
  }
`;

export const KAMPAGNE_ANLEGEN = gql`
  mutation KampagneAnlegen($input: KampagneInput!) {
    kampagneAnlegen(input: $input) { ${KAMPAGNEN_FELDER} }
  }
`;

export const KAMPAGNE_AENDERN = gql`
  mutation KampagneAendern($id: ID!, $input: KampagneAendernInput!) {
    kampagneAendern(id: $id, input: $input) { ${KAMPAGNEN_FELDER} }
  }
`;

export const KAMPAGNE_LOESCHEN = gql`
  mutation KampagneLoeschen($id: ID!) {
    kampagneLoeschen(id: $id)
  }
`;

export const KAMPAGNEN_EMPFAENGER_FESTLEGEN = gql`
  mutation KampagnenEmpfaengerFestlegen(
    $id: ID!
    $auswahl: EmpfaengerAuswahlInput!
  ) {
    kampagnenEmpfaengerFestlegen(id: $id, auswahl: $auswahl) { ${KAMPAGNEN_FELDER} }
  }
`;

export const KAMPAGNE_TESTMAIL = gql`
  mutation KampagneTestmail($id: ID!) {
    kampagneTestmail(id: $id)
  }
`;

export const KAMPAGNE_STARTEN = gql`
  mutation KampagneStarten($id: ID!) {
    kampagneStarten(id: $id) { ${KAMPAGNEN_FELDER} }
  }
`;

export const KAMPAGNE_ABBRECHEN = gql`
  mutation KampagneAbbrechen($id: ID!) {
    kampagneAbbrechen(id: $id) { ${KAMPAGNEN_FELDER} }
  }
`;

export const ABMELDUNGEN = gql`
  query Abmeldungen($suche: String) {
    abmeldungen(suche: $suche) {
      id
      email
      thema
      zeitpunkt
    }
  }
`;

export const KAMPAGNEN_THEMEN = gql`
  query KampagnenThemen {
    kampagnenThemen
  }
`;

const KACHEL_FIELDS = `
  id
  typ
  titel
  objekt
  mass
  gruppe
  status
  pipelineId
  nurMeine
  zeitraum
  liste
`;

export const MEINE_UEBERSICHT = gql`
  query MeineUebersicht {
    meineUebersicht { ${KACHEL_FIELDS} }
  }
`;

export const UEBERSICHT_SPEICHERN = gql`
  mutation UebersichtSpeichern($kacheln: [KachelInput!]!) {
    uebersichtSpeichern(kacheln: $kacheln) { ${KACHEL_FIELDS} }
  }
`;

export const UEBERSICHT_ZURUECKSETZEN = gql`
  mutation UebersichtZuruecksetzen {
    uebersichtZuruecksetzen { ${KACHEL_FIELDS} }
  }
`;

export const KACHELN_WERTE = gql`
  query KachelnWerte($kacheln: [KachelInput!]!) {
    kachelnWerte(kacheln: $kacheln) {
      gesperrt
      hinweis
      betraegeVerborgen
      anzahl
      wert
      balken {
        schluessel
        label
        farbe
        anzahl
        wert
      }
      eintraege {
        id
        titel
        zusatz
        link
      }
    }
  }
`;

const DASHBOARD_FIELDS = `
  id
  name
  privat
  createdById
  darfAendern
  kacheln { ${KACHEL_FIELDS} }
`;

export const DASHBOARDS = gql`
  query Dashboards {
    dashboards { ${DASHBOARD_FIELDS} }
  }
`;

export const DASHBOARD_ANLEGEN = gql`
  mutation DashboardAnlegen($input: DashboardAnlegenInput!) {
    dashboardAnlegen(input: $input) { ${DASHBOARD_FIELDS} }
  }
`;

export const DASHBOARD_AENDERN = gql`
  mutation DashboardAendern($id: ID!, $input: DashboardAendernInput!) {
    dashboardAendern(id: $id, input: $input) { ${DASHBOARD_FIELDS} }
  }
`;

export const DASHBOARD_KACHELN_SPEICHERN = gql`
  mutation DashboardKachelnSpeichern($id: ID!, $kacheln: [KachelInput!]!) {
    dashboardKachelnSpeichern(id: $id, kacheln: $kacheln) { ${DASHBOARD_FIELDS} }
  }
`;

export const DASHBOARD_LOESCHEN = gql`
  mutation DashboardLoeschen($id: ID!) {
    dashboardLoeschen(id: $id)
  }
`;

export const PIPELINE_NACH_PHASE = gql`
  query PipelineNachPhase($pipelineId: ID) {
    pipeline(pipelineId: $pipelineId) {
      stage
      dealCount
      totalAmount
    }
  }
`;

export const BETRIEBS_HINWEIS = gql`
  query BetriebsHinweis {
    betriebsHinweis {
      id
      text
      von
      bis
      wartung
    }
  }
`;

export const BETRIEBS_ZUSTAND = gql`
  query BetriebsZustand {
    betriebsZustand {
      version
      gestartetAm
      datenbankOk
      datenbankMs
      offeneMigrationen
      mailVersand
      postfaecher
      postfaecherMitFehler
      kalender
      kalenderMitFehler
      oauthWiderrufen
      speicherFreiBytes
      speicherGesamtBytes
      protokollAenderungenMonate
      protokollSicherheitMonate
      sicherung {
        zustand
        letzteSicherung
        groesseBytes
        anzahl
        ausserHaus
        kopien
        letzterFehler
        letzterFehlerAm
        probeAm
        probeOk
        probeDauerSek
        probeMeldung
        warnungen
      }
      laeufe {
        name
        zustand
        intervallSek
        letzterStart
        letzterErfolg
        letzterFehlerAm
        letzterFehler
        letzteDauerMs
        laeufe
        fehlerInFolge
      }
    }
    ankuendigungen {
      id
      text
      von
      bis
      wartung
      createdAt
    }
  }
`;

export const ANKUENDIGUNG_SETZEN = gql`
  mutation AnkuendigungSetzen($input: AnkuendigungInput!) {
    ankuendigungSetzen(input: $input) {
      id
    }
  }
`;

export const ANKUENDIGUNG_BEENDEN = gql`
  mutation AnkuendigungBeenden($id: ID!) {
    ankuendigungBeenden(id: $id)
  }
`;

export const AUSWAHL_FIRMEN = gql`
  query AuswahlFirmen($search: String) {
    companies(
      search: $search
      limit: 8
      sortField: "name"
      sortDirection: ASC
    ) {
      items {
        id
        name
        city
      }
    }
  }
`;

export const AUSWAHL_KONTAKTE = gql`
  query AuswahlKontakte($search: String) {
    contacts(
      search: $search
      limit: 8
      sortField: "lastName"
      sortDirection: ASC
    ) {
      items {
        id
        firstName
        lastName
        email
        companyId
        company {
          id
          name
        }
      }
    }
  }
`;

export const AUSWAHL_GESCHAEFTE = gql`
  query AuswahlGeschaefte($search: String) {
    deals(search: $search, limit: 8, sortField: "name", sortDirection: ASC) {
      items {
        id
        name
        companyId
        company {
          id
          name
        }
      }
    }
  }
`;

export const DEAL_ROLLEN = gql`
  query DealRollen {
    dealRollen
  }
`;

export const DEAL_KONTAKT_HINZUFUEGEN = gql`
  mutation DealKontaktHinzufuegen(
    $dealId: ID!
    $contactId: ID!
    $rolle: String
  ) {
    dealKontaktHinzufuegen(
      dealId: $dealId
      contactId: $contactId
      rolle: $rolle
    ) {
      id
      contactId
      rolle
    }
  }
`;

export const DEAL_KONTAKT_ROLLE = gql`
  mutation DealKontaktRolle($id: ID!, $rolle: String) {
    dealKontaktRolle(id: $id, rolle: $rolle) {
      id
      rolle
    }
  }
`;

export const DEAL_KONTAKT_ENTFERNEN = gql`
  mutation DealKontaktEntfernen($id: ID!) {
    dealKontaktEntfernen(id: $id)
  }
`;

export const DEAL_KONTAKT_ZUM_HAUPTKONTAKT = gql`
  mutation DealKontaktZumHauptkontakt($id: ID!) {
    dealKontaktZumHauptkontakt(id: $id) {
      id
      primaryContactId
    }
  }
`;

export const BEISPIELDATEN = gql`
  query Beispieldaten {
    beispieldaten
  }
`;

export const BEISPIELDATEN_LADEN = gql`
  mutation BeispieldatenLaden {
    beispieldatenLaden
  }
`;

export const BEISPIELDATEN_ENTFERNEN = gql`
  mutation BeispieldatenEntfernen {
    beispieldatenEntfernen
  }
`;

export const BRANCHENVORLAGE_ANWENDEN = gql`
  mutation BranchenvorlageAnwenden($vorlage: String!) {
    branchenvorlageAnwenden(vorlage: $vorlage)
  }
`;

export const BEGLEITBELEGE = gql`
  query Begleitbelege($filter: BegleitbelegFilterInput) {
    begleitbelege(filter: $filter) {
      id
      art
      number
      status
      stornoVonId
      issuedOn
      liefertermin
      angebotId
      currency
      angebot {
        id
        number
      }
      stornoVon {
        id
        number
      }
      company {
        id
        name
      }
      totals {
        grossCents
      }
    }
  }
`;

export const BEGLEITBELEG = gql`
  query Begleitbeleg($id: ID!) {
    begleitbeleg(id: $id) {
      id
      art
      number
      status
      stornoVonId
      stornoGrund
      storniertAm
      angebotId
      auftragsbestaetigungId
      recipientAddress
      lieferadresse
      issuedOn
      liefertermin
      introText
      closingText
      currency
      kontaktName
      createdAt
      angebot {
        id
        number
        issuedOn
        status
      }
      contact {
        id
        email
        firstName
        lastName
      }
      auftragsbestaetigung {
        id
        number
      }
      stornoVon {
        id
        number
      }
      company {
        id
        name
      }
      deal {
        id
        name
      }
      positionen {
        id
        angebotsPositionId
        position
        name
        articleNumber
        description
        quantity
        unit
        unitPriceCents
        discountPercent
        taxRatePercent
        restOffen
      }
      totals {
        netCents
        taxCents
        grossCents
      }
    }
  }
`;

export const LIEFERSTAND = gql`
  query Lieferstand($angebotId: ID!) {
    lieferstand(angebotId: $angebotId) {
      angebotsPositionId
      position
      name
      articleNumber
      unit
      bestellt
      geliefert
      offen
    }
  }
`;

export const AUFTRAGSBESTAETIGUNG_STELLEN = gql`
  mutation AuftragsbestaetigungStellen($input: AuftragsbestaetigungInput!) {
    auftragsbestaetigungStellen(input: $input) {
      id
      number
    }
  }
`;

export const LIEFERSCHEIN_STELLEN = gql`
  mutation LieferscheinStellen($input: LieferscheinInput!) {
    lieferscheinStellen(input: $input) {
      id
      number
    }
  }
`;

export const BEGLEITBELEG_STORNIEREN = gql`
  mutation BegleitbelegStornieren($id: ID!, $grund: String) {
    begleitbelegStornieren(id: $id, grund: $grund) {
      id
      number
    }
  }
`;

export const BEGLEITBELEG_ALS_ANHANG = gql`
  mutation BegleitbelegAlsAnhang($id: ID!) {
    begleitbelegAlsAnhang(id: $id) {
      id
      name
      sizeBytes
    }
  }
`;

const MAIL_ENTWURF_FIELDS = `
  id
  an
  cc
  betreff
  rumpf
  companyId
  contactId
  dealId
  quelle
  status
  gesendetAm
  createdAt
  updatedAt
`;

export const MAIL_ENTWUERFE = gql`
  query MailEntwuerfe {
    mailEntwuerfe { ${MAIL_ENTWURF_FIELDS} }
  }
`;

export const MAIL_ENTWURF_AENDERN = gql`
  mutation MailEntwurfAendern($id: ID!, $input: MailEntwurfFelderInput!) {
    mailEntwurfAendern(id: $id, input: $input) { ${MAIL_ENTWURF_FIELDS} }
  }
`;

export const MAIL_ENTWURF_SENDEN = gql`
  mutation MailEntwurfSenden($id: ID!, $input: MailEntwurfFelderInput!) {
    mailEntwurfSenden(id: $id, input: $input) { ${MAIL_ENTWURF_FIELDS} }
  }
`;

export const MAIL_ENTWURF_VERWERFEN = gql`
  mutation MailEntwurfVerwerfen($id: ID!) {
    mailEntwurfVerwerfen(id: $id) { ${MAIL_ENTWURF_FIELDS} }
  }
`;

const KI_VORSCHLAG_FIELDS = `
  id
  werkzeug
  zusammenfassung
  schluesselName
  zielArt
  zielId
  zielName
  zielPfad
  vorher
  nachher
  status
  entschiedenVon
  entschiedenAm
  grund
  fehler
  ergebnisPfad
  createdAt
`;

export const KI_VORSCHLAEGE = gql`
  query KiVorschlaege($status: [String!]) {
    kiVorschlaege(status: $status) { ${KI_VORSCHLAG_FIELDS} }
  }
`;

export const KI_VORSCHLAEGE_FUER = gql`
  query KiVorschlaegeFuer($art: String!, $id: ID!) {
    kiVorschlaegeFuer(art: $art, id: $id) {
      id
      zusammenfassung
    }
  }
`;

export const OFFENE_KI_VORSCHLAEGE = gql`
  query OffeneKiVorschlaege {
    offeneKiVorschlaege
  }
`;

export const KI_VORSCHLAG_ANNEHMEN = gql`
  mutation KiVorschlagAnnehmen($id: ID!, $trotzdem: Boolean) {
    kiVorschlagAnnehmen(id: $id, trotzdem: $trotzdem) {
      veraltet
      aktuell
      vorschlag { ${KI_VORSCHLAG_FIELDS} }
    }
  }
`;

export const KI_VORSCHLAG_VERWERFEN = gql`
  mutation KiVorschlagVerwerfen($id: ID!, $grund: String) {
    kiVorschlagVerwerfen(id: $id, grund: $grund) { ${KI_VORSCHLAG_FIELDS} }
  }
`;

const VERTEILER_FIELDS = `
  id
  name
  beschreibung
  anzahl
  createdAt
  updatedAt
`;

export const VERTEILER_LISTE = gql`
  query VerteilerListe {
    verteilerListe { ${VERTEILER_FIELDS} }
  }
`;

export const VERTEILER_MITGLIEDER = gql`
  query VerteilerMitglieder($id: ID!) {
    verteiler(id: $id) { ${VERTEILER_FIELDS} }
    verteilerMitglieder(id: $id) {
      hinzugefuegtAm
      abgemeldet
      contact {
        id
        firstName
        lastName
        email
        company { id name }
      }
    }
  }
`;

export const VERTEILER_ANLEGEN = gql`
  mutation VerteilerAnlegen($input: VerteilerInput!) {
    verteilerAnlegen(input: $input) { ${VERTEILER_FIELDS} }
  }
`;

export const VERTEILER_AENDERN = gql`
  mutation VerteilerAendern($id: ID!, $input: VerteilerInput!) {
    verteilerAendern(id: $id, input: $input) { ${VERTEILER_FIELDS} }
  }
`;

export const VERTEILER_LOESCHEN = gql`
  mutation VerteilerLoeschen($id: ID!) {
    verteilerLoeschen(id: $id)
  }
`;

export const VERTEILER_HINZUFUEGEN = gql`
  mutation VerteilerMitgliederHinzufuegen($id: ID!, $kontaktIds: [ID!]!) {
    verteilerMitgliederHinzufuegen(id: $id, kontaktIds: $kontaktIds) { ${VERTEILER_FIELDS} }
  }
`;

export const VERTEILER_ENTFERNEN = gql`
  mutation VerteilerMitgliederEntfernen($id: ID!, $kontaktIds: [ID!]!) {
    verteilerMitgliederEntfernen(id: $id, kontaktIds: $kontaktIds) { ${VERTEILER_FIELDS} }
  }
`;

export const ANMELDE_ANBIETER = gql`
  query AnmeldeAnbieter {
    anmeldeAnbieter
  }
`;

export const ANMELDUNG_STARTEN = gql`
  mutation AnmeldungStarten($anbieter: String!, $angemeldetBleiben: Boolean) {
    anmeldungStarten(anbieter: $anbieter, angemeldetBleiben: $angemeldetBleiben)
  }
`;

export const REGISTRIERUNG_STARTEN = gql`
  mutation RegistrierungStarten($anbieter: String!, $arbeitsbereich: String!) {
    registrierungStarten(anbieter: $anbieter, arbeitsbereich: $arbeitsbereich)
  }
`;

export const ANMELDUNG_EINLOESEN = gql`
  mutation AnmeldungEinloesen($token: String!, $totpCode: String) {
    anmeldungEinloesen(token: $token, totpCode: $totpCode) {
      token
      angemeldetBleiben
      user {
        id
        email
        firstName
        lastName
      }
      workspace {
        id
        name
        slug
      }
    }
  }
`;

export const ANMELDE_VERKNUEPFUNGEN = gql`
  query AnmeldeVerknuepfungen {
    anmeldeVerknuepfungen {
      anbieter
      email
      zuletztAm
      createdAt
    }
  }
`;

export const ANMELDUNG_VERKNUEPFEN_STARTEN = gql`
  mutation AnmeldungVerknuepfenStarten($anbieter: String!, $passwort: String) {
    anmeldungVerknuepfenStarten(anbieter: $anbieter, passwort: $passwort)
  }
`;

export const ANMELDUNG_TRENNEN = gql`
  mutation AnmeldungTrennen($anbieter: String!) {
    anmeldungTrennen(anbieter: $anbieter)
  }
`;

export const PASSWORT_LINK_SENDEN = gql`
  mutation PasswortLinkSenden {
    passwortLinkSenden
  }
`;

const IMPRESSUM_FIRMA = `
  id
  name
  website
  street
  postalCode
  city
  country
  invoiceEmail
  phone
  email
  vertretung
  registergericht
  registernummer
  ustIdNr
  logo
  logoQuelle
`;

export const IMPRESSUM_LESEN = gql`
  mutation ImpressumLesen($companyId: ID!) {
    impressumLesen(companyId: $companyId) {
      quelle
      felder {
        feld
        label
        wert
        aktuell
        uebernehmbar
        grund
      }
    }
  }
`;

export const IMPRESSUM_UEBERNEHMEN = gql`
  mutation ImpressumUebernehmen($input: ImpressumUebernahmeInput!) {
    impressumUebernehmen(input: $input) { ${IMPRESSUM_FIRMA} }
  }
`;

export const FIRMENLOGO_LADEN = gql`
  mutation FirmenlogoLaden($companyId: ID!) {
    firmenlogoLaden(companyId: $companyId) { ${IMPRESSUM_FIRMA} }
  }
`;

export const FIRMENLOGO_ENTFERNEN = gql`
  mutation FirmenlogoEntfernen($companyId: ID!) {
    firmenlogoEntfernen(companyId: $companyId) { ${IMPRESSUM_FIRMA} }
  }
`;

const KI_EINSTELLUNG_FIELDS = `
  id
  anbieter
  modell
  nutzung
  geprueftAm
  createdAt
  updatedAt
`;

export const KI_EINSTELLUNG = gql`
  query KiEinstellung {
    kiEinstellung { ${KI_EINSTELLUNG_FIELDS} }
  }
`;

export const KI_EINRICHTEN = gql`
  mutation KiEinrichten($input: KiEinrichtenInput!) {
    kiEinrichten(input: $input) { ${KI_EINSTELLUNG_FIELDS} }
  }
`;

export const KI_NUTZUNG_SETZEN = gql`
  mutation KiNutzungSetzen($nutzung: String!) {
    kiNutzungSetzen(nutzung: $nutzung) { ${KI_EINSTELLUNG_FIELDS} }
  }
`;

export const KI_ENTFERNEN = gql`
  mutation KiEntfernen {
    kiEntfernen
  }
`;

export const KI_CHAT = gql`
  mutation KiChat($input: KiChatInput!) {
    kiChat(input: $input) {
      antwort
      gekuerzt
      vorschlaege {
        id
        zusammenfassung
      }
      schritte {
        werkzeug
        titel
        ok
      }
    }
  }
`;

export const KI_ENTWURF = gql`
  mutation KiEntwurf($input: KiEntwurfInput!) {
    kiEntwurf(input: $input)
  }
`;

export const SETZE_NOTIZ_ZIELE = gql`
  mutation SetzeNotizZiele($input: NotizZieleInput!) {
    setzeNotizZiele(input: $input) { ${NOTE_FIELDS} }
  }
`;

const FREIGABE_STAND_FELDER = `
  darfVerwalten
  verantwortlichId
  freigaben {
    id
    userId
    name
    stufe
    erteiltVon
    createdAt
  }
`;

export const FREIGABE_STAND = gql`
  query FreigabeStand($art: String!, $datensatzId: ID!) {
    freigabeStand(art: $art, datensatzId: $datensatzId) {
      ${FREIGABE_STAND_FELDER}
    }
  }
`;

export const FREIGEBEN = gql`
  mutation Freigeben($input: FreigebenInput!) {
    freigeben(input: $input) {
      ${FREIGABE_STAND_FELDER}
    }
  }
`;

export const FREIGABE_ENTZIEHEN = gql`
  mutation FreigabeEntziehen($id: ID!) {
    freigabeEntziehen(id: $id)
  }
`;

export const WER_SIEHT_DAS = gql`
  query WerSiehtDas($art: String!, $datensatzId: ID!) {
    werSiehtDas(art: $art, datensatzId: $datensatzId) {
      userId
      name
      rolle
      sieht
      bearbeitet
      grund
    }
  }
`;
