# South African Accounting Standards — Master Specification

**Status: north-star requirements document, not a completed feature.** This is the
full target scope for the accounting engine (117 sections, 12 build phases per §116).
It is supplied by the user as the governing standard for how this software's
accounting, tax, VAT, payroll, and compliance logic must work. Nothing in this repo
currently implements more than a slice of it — see `docs/SA_SPEC_GAP_ANALYSIS.md` for
what exists today versus what this document requires.

**Non-negotiable rules from this spec that apply to every future accounting change in
this codebase** (see the full text below for complete context):

- Do not invent accounting/tax rules; verify against authoritative SA sources or flag
  "requires professional/accounting review" (§110, §111).
- Rates and thresholds (VAT rate, corporate tax rate, SBC brackets, registration
  thresholds) must be stored as effective-dated configuration data, never hard-coded
  in application logic (§9, §52, §53, §82, §113).
- Debits must equal credits on every posted transaction, with no exception (§4, §41).
- Posted accounting records are immutable; corrections are new events (reversals,
  credit notes, correcting journals), never edits or deletes (§14, §36, §79).
- The General Ledger is the sole accounting source of truth; never derive financial
  reports from invoice tables, cached frontend values, or UI state (§73, §97).
- Every accounting event must be traceable: source document → journal → GL → subledger
  → trial balance → financial statements → tax reconciliation (§63, §80, §99, §100).
- Accounting profit ≠ taxable income; accounting depreciation ≠ tax allowance;
  maintain accounting, tax, VAT, payroll, and reporting as separate layers (§26, §95).
- Closed accounting periods reject normal-user postings; reopening requires
  authorization and creates an audit event (§35, §68).
- All audit logs are append-only (§37).

---

<the rest of this file is the user-supplied specification, preserved verbatim as the
governing reference>

## 1. AUTHORITATIVE SOURCES

The accounting engine must distinguish between:

1. South African legislation
2. Regulations
3. SARS requirements
4. Financial reporting standards
5. Professional accounting guidance
6. Audit standards
7. Company-law requirements
8. Industry-specific requirements

Priority should generally be:

### Tier 1 — Legislation and regulators

Use authoritative sources including:

* Companies Act 71 of 2008
* Companies Regulations, 2011 and amendments
* Income Tax Act 58 of 1962
* Value-Added Tax Act 89 of 1991
* Tax Administration Act 28 of 2011
* Transfer Duty Act
* Securities Transfer Tax Act
* Skills Development Levies Act
* Unemployment Insurance Contributions Act
* Employment Tax Incentive Act
* Customs and Excise legislation where applicable
* Basic Conditions of Employment legislation where relevant to payroll
* Labour legislation where relevant
* CIPC requirements
* SARS requirements
* National Treasury requirements
* Financial Reporting Standards Council requirements
* Accounting Standards Board requirements where applicable
* IRBA requirements where applicable
* JSE requirements where applicable

### Tier 2 — Financial reporting

Support:

* IFRS Accounting Standards
* IFRS for SMEs Accounting Standard
* applicable South African financial reporting pronouncements
* applicable GRAP requirements for public-sector entities

South Africa requires IFRS for certain entities and permits IFRS for SMEs for
qualifying entities. SA GAAP should NOT be treated as a modern independent framework
to implement as a separate accounting engine without verifying the current legal
position.

The Companies Act specifically requires financial statements to meet prescribed
financial reporting standards and to present fairly the state of affairs and business
of the company.

---

# 2. ENTITY REPORTING FRAMEWORK

Every company/entity must have a configured:

* legal entity type
* company type
* ownership structure
* public/private status
* listed/unlisted status
* public interest score
* public accountability status
* reporting framework
* financial year-end
* accounting basis
* functional currency
* presentation currency
* VAT registration status
* tax registration status

The system must determine which financial reporting framework applies.

Possible frameworks include:

* Full IFRS
* IFRS for SMEs
* applicable South African requirements for entities not subject to prescribed
  IFRS/IFRS for SMEs requirements
* GRAP where applicable
* other legally applicable frameworks

Do not assume every South African business uses the same reporting framework.

---

# 3. PUBLIC INTEREST SCORE

Implement a Public Interest Score engine.

The system must calculate and retain the company's Public Interest Score using the
applicable Companies Regulations methodology.

The calculation must consider the applicable factors, including:

* number of employees
* third-party liabilities
* turnover
* shareholders/directors or applicable ownership factors as prescribed

The system must:

* calculate the score automatically
* retain the calculation
* show the components
* show the reporting period
* retain historical scores
* determine whether the score changed the applicable reporting requirements
* warn the user when the reporting framework may need to change
* never silently change the reporting framework

The user must be able to override the automatically determined framework only through
an authorized accounting/admin workflow, with the reason recorded.

---

# 4. DOUBLE-ENTRY ACCOUNTING ENGINE

The core accounting engine MUST be true double-entry accounting.

Every posted accounting transaction must satisfy:

## DEBITS = CREDITS

No exception.

Every transaction must contain:

* transaction ID
* document ID where applicable
* transaction date
* posting date
* accounting period
* source module
* journal
* debit lines
* credit lines
* accounts
* tax codes where applicable
* VAT amounts where applicable
* dimensions/cost centres where applicable
* description
* user who created it
* user who posted it
* timestamp
* source/reference
* status
* reversal information if applicable

Never allow a posted journal to become unbalanced.

---

# 5. GENERAL LEDGER

Implement a complete General Ledger.

It must support:

* chart of accounts
* account classes
* account types
* subaccounts
* control accounts
* journals
* recurring journals
* manual journals
* automatic journals
* reversing journals
* accrual journals
* prepayment journals
* depreciation journals
* inventory journals
* VAT journals
* payroll journals
* tax journals
* bank journals
* foreign exchange journals
* year-end journals
* opening balances
* retained earnings
* prior-period adjustments

The General Ledger is the authoritative accounting record.

Subledgers must reconcile to the General Ledger.

---

# 6. CHART OF ACCOUNTS

Build a configurable South African chart of accounts.

At minimum support:

## Assets

* cash
* bank
* petty cash
* trade receivables
* other receivables
* inventory
* prepayments
* VAT input
* fixed assets
* accumulated depreciation
* intangible assets
* investments
* deferred tax assets
* other assets

## Liabilities

* trade payables
* accruals
* loans
* leases
* VAT output
* PAYE payable
* UIF payable
* SDL payable
* employee deductions
* income tax payable
* dividends payable
* provisions
* deferred tax liabilities
* other liabilities

## Equity

* share capital
* share premium
* retained earnings
* current-year profit/loss
* reserves
* other comprehensive income reserves

## Income

* sales
* service income
* other income
* interest income
* rental income
* gains/losses

## Expenses

* cost of sales
* purchases
* wages
* salaries
* rent
* utilities
* insurance
* professional fees
* bank charges
* depreciation
* finance costs
* interest
* repairs
* advertising
* travel
* motor expenses
* telecommunications
* software
* tax expenses
* other operating expenses

Allow businesses to customize their chart of accounts without breaking statutory
reporting.

---

# 7. ACCOUNTING EQUATION

The system must continuously enforce:

ASSETS = LIABILITIES + EQUITY

and:

PROFIT = INCOME - EXPENSES

The system must be capable of deriving the Balance Sheet/Statement of Financial
Position from the underlying ledger rather than storing fake totals.

---

# 8. ACCRUAL ACCOUNTING

The accounting engine must support proper accrual accounting.

Do not treat:

* invoice
* payment
* receipt
* expense
* income

as the same event.

For example:

A customer invoice creates:

DR Trade Receivables
CR Revenue
CR VAT Output where applicable

A customer payment creates:

DR Bank
CR Trade Receivables

Supplier invoice:

DR Expense/Inventory/Asset
DR VAT Input where applicable
CR Trade Payables

Supplier payment:

DR Trade Payables
CR Bank

The exact treatment must depend on the transaction and tax/accounting configuration.

---

# 9. VAT ENGINE

Implement a dedicated South African VAT engine.

VAT must NOT simply be a percentage field on an invoice.

The VAT engine must understand:

* standard-rated supplies
* zero-rated supplies
* exempt supplies
* non-taxable transactions
* input tax
* output tax
* capital goods
* imported goods
* imported services
* exports
* debit notes
* credit notes
* bad debt adjustments
* change-in-use adjustments
* mixed supplies
* apportionment
* deemed supplies
* special time-of-supply rules
* reverse-charge rules where applicable
* VAT payments
* VAT refunds
* VAT control accounts

Current standard VAT rate must be configurable and versioned. As at August 2026, SARS
states the VAT rate is 15%.

Do NOT hard-code 15% permanently.

Store:

* tax rate
* effective-from date
* effective-to date
* tax code
* tax treatment
* jurisdiction
* source/legal reference

This is essential because tax rates can change.

---

# 10. VAT REGISTRATION

Store:

* VAT registration number
* VAT effective date
* VAT deregistration date
* VAT filing frequency
* VAT accounting basis
* VAT period
* SARS status
* VAT representative information where applicable

Current SARS information states compulsory VAT registration applies when taxable
supplies exceed R2.3 million in the applicable preceding 12-month period, while
voluntary registration is available above R120,000 subject to the rules.

These thresholds MUST be configuration data, not hard-coded application logic.

---

# 11. VAT ACCOUNTING BASIS

Support:

* invoice/accrual basis
* payments basis where legally permitted and approved

The default VAT accounting treatment must follow the applicable SARS rules.

SARS states that VAT is generally accounted for on the invoice basis, while the
payments basis is available only to qualifying vendors and subject to applicable
requirements/approval.

---

# 12. VAT TAX CODES

Create configurable VAT codes such as:

* standard rate
* zero rate
* exempt
* no VAT
* out of scope
* input VAT
* output VAT
* capital input VAT
* import VAT
* reverse charge
* blocked/non-deductible input VAT

Every transaction must be able to identify:

* VAT treatment
* VAT amount
* VAT base
* VAT rate
* VAT code
* VAT period
* VAT return mapping

---

# 13. TAX INVOICES

The invoice module must support compliant South African tax invoices.

A VAT invoice must contain the required information under the VAT legislation.

SARS identifies requirements including:

* words such as "Tax Invoice"/"VAT Invoice"/"Invoice"
* supplier name
* supplier address
* supplier VAT number
* recipient information where applicable
* invoice serial number
* date
* description
* quantity/volume
* value
* VAT charged
* total consideration

SARS also states that a tax invoice is generally required for taxable supplies and is
an important part of the VAT audit trail.

The software must therefore generate invoices that are configurable according to the
applicable VAT requirements.

---

# 14. INVOICE NUMBERING

Invoice numbers must:

* be sequential
* be unique
* never be duplicated
* never silently change
* support configurable prefixes
* support financial-year numbering if configured
* retain historical numbers
* prevent deletion of posted invoices
* support cancellation/voiding with audit trail

Do NOT simply delete invoices.

---

# 15. CREDIT NOTES

Implement proper credit notes.

A credit note must:

* reference the original invoice where applicable
* contain its own unique number
* reverse the appropriate accounting entries
* reverse VAT correctly
* preserve the original invoice
* record the reason
* create a complete audit trail

---

# 16. DEBIT NOTES

Implement debit notes with equivalent controls.

They must be linked to the relevant transaction where required and correctly affect:

* customer balance
* revenue/expense
* VAT
* General Ledger

---

# 17. CUSTOMER SUBLEDGER

Every customer account must maintain:

* opening balance
* invoices
* credit notes
* debit notes
* receipts
* allocations
* discounts
* write-offs
* refunds
* outstanding balance
* ageing
* statements
* payment history

Customer subledger must reconcile to:

TRADE RECEIVABLES CONTROL ACCOUNT

---

# 18. SUPPLIER SUBLEDGER

Every supplier account must maintain:

* opening balance
* supplier invoices
* credit notes
* debit notes
* payments
* allocations
* discounts
* refunds
* outstanding balance
* ageing
* statements
* payment history

Supplier subledger must reconcile to:

TRADE PAYABLES CONTROL ACCOUNT

---

# 19. BANKING

Implement complete bank accounting.

Support:

* bank accounts
* opening balances
* bank transactions
* deposits
* withdrawals
* transfers
* bank charges
* interest
* electronic payments
* receipts
* bank feeds
* imports
* bank reconciliation
* outstanding deposits
* outstanding payments
* unmatched transactions

Bank reconciliation must NOT alter the General Ledger merely because a transaction has
been reconciled.

Reconciliation is a control state, not a replacement for accounting.

---

# 20. BANK RECONCILIATION

Implement:

* statement balance
* book balance
* outstanding deposits
* outstanding payments
* unreconciled items
* bank charges
* interest
* errors
* adjustments
* reconciliation date
* reconciliation user
* reconciliation status

A completed reconciliation must be locked unless an authorized user reopens it.

Reopening must create an audit event.

---

# 21. PETTY CASH

Implement:

* petty cash accounts
* float
* cash advances
* expenses
* replenishment
* cash count
* reconciliation
* shortages
* overages
* supporting documents

---

# 22. INVENTORY

Implement a full perpetual inventory system.

Support:

* stock items
* SKU
* barcode
* units of measure
* warehouses
* locations
* bins
* opening stock
* purchases
* sales
* stock transfers
* stock adjustments
* stock counts
* damaged stock
* returned stock
* supplier returns
* customer returns
* stock write-offs
* stock movements
* stock valuation

Inventory must integrate with the General Ledger.

---

# 23. INVENTORY VALUATION

Support legally/accountingly appropriate inventory valuation methods, depending on the
reporting framework.

At minimum architect the system to support:

* FIFO where permitted
* weighted average cost
* standard cost where operationally appropriate, with accounting adjustments
* cost
* net realisable value
* write-downs

The system must distinguish operational stock costing from financial reporting
measurement.

Inventory must be capable of producing:

* quantity
* unit cost
* total cost
* valuation
* movements
* adjustments
* cost of sales

---

# 24. COST OF SALES

When inventory is sold, the system must automatically generate the appropriate
accounting entry.

For example:

DR Cost of Sales
CR Inventory

The exact accounting must follow the configured inventory methodology.

Do not allow sales revenue to be recorded without the corresponding inventory/cost
treatment where inventory is involved.

---

# 25. FIXED ASSETS

Implement a full fixed asset register.

Support:

* asset number
* asset class
* description
* acquisition date
* supplier
* cost
* accumulated depreciation
* useful life
* depreciation method
* residual value
* location
* custodian
* impairment
* disposals
* transfers
* additions
* componentisation where applicable
* tax treatment
* accounting treatment

---

# 26. DEPRECIATION

Support accounting depreciation separately from tax depreciation.

Do NOT assume accounting depreciation equals SARS tax allowance.

Maintain:

ACCOUNTING BASIS

and

TAX BASIS

separately.

This distinction is critical.

---

# 27. TAX FIXED ASSET REGISTER

Maintain a separate tax asset register where required.

Support:

* tax cost
* tax allowances
* tax write-offs
* recoupments
* scrapping allowances
* disposal proceeds
* tax gain/loss

The tax register must be capable of reconciling to the accounting fixed asset
register.

---

# 28. ACCRUALS

Implement accruals.

Examples:

* utilities
* salaries
* professional fees
* interest
* audit fees
* annual subscriptions
* rent
* bonuses

Support:

* recurring accruals
* manual accruals
* automatic reversal
* supporting documents
* period allocation

---

# 29. PREPAYMENTS

Implement prepaid expenses.

Support:

* original transaction
* prepaid balance
* recognition schedule
* monthly release
* remaining balance
* automatic journals

Example:

Initial:

DR Prepaid Expense
CR Bank/Payable

Monthly:

DR Expense
CR Prepaid Expense

---

# 30. PROVISIONS

Support accounting provisions separately from ordinary accruals.

The system must allow configuration according to the applicable reporting framework.

---

# 31. LOANS

Implement:

* loans payable
* loan receivables
* principal
* interest
* repayment schedules
* current/non-current classification
* accrued interest
* fees
* refinancing
* early settlement
* effective interest calculations where applicable

---

# 32. LEASES

Architect support for lease accounting.

Depending on reporting framework, support:

* lease contracts
* right-of-use assets
* lease liabilities
* payment schedules
* interest
* depreciation
* modifications
* termination
* current/non-current classification

Do not assume every entity has identical lease accounting requirements.

---

# 33. FOREIGN CURRENCY

Support:

* foreign currency customers
* foreign currency suppliers
* foreign currency bank accounts
* foreign currency invoices
* exchange rates
* transaction-date rates
* settlement rates
* closing rates
* realised foreign exchange gains/losses
* unrealised foreign exchange gains/losses
* revaluation

Maintain:

transaction currency

and

functional/presentation currency.

---

# 34. YEAR-END PROCESS

Implement a controlled year-end procedure.

Before closing:

* bank reconciliation
* debtors reconciliation
* creditors reconciliation
* inventory reconciliation
* VAT reconciliation
* payroll reconciliation
* fixed asset reconciliation
* loan reconciliation
* tax reconciliation
* suspense account review
* control account review
* trial balance
* adjusting journals
* accruals
* prepayments
* depreciation
* impairment
* provisions
* foreign currency revaluation
* tax calculations
* retained earnings

The system must produce a year-end checklist.

---

# 35. ACCOUNTING PERIODS

Implement:

* financial years
* accounting periods
* period start/end dates
* open periods
* closed periods
* locked periods
* adjustment periods if required
* period reopening

Once a period is closed:

NORMAL USERS MUST NOT POST INTO IT.

An authorized reopening must record:

* user
* date/time
* reason
* old status
* new status

---

# 36. NO DELETION OF POSTED ACCOUNTING DATA

This is critical.

A posted accounting transaction must NOT simply be deleted.

Instead support:

* reversal
* cancellation
* credit note
* correcting journal
* voiding with audit trail

The original transaction must remain visible.

---

# 37. AUDIT TRAIL

Every material accounting action must be logged.

Audit log must contain:

* user
* timestamp
* action
* module
* record ID
* previous value
* new value
* IP/session information where appropriate
* reason where required

Track:

* created
* edited
* posted
* approved
* reversed
* cancelled
* deleted where deletion is legally/technically permitted
* period closed
* period reopened
* bank reconciliation
* tax return preparation
* tax return finalisation
* user permission changes

Audit logs must be append-only.

---

# 38. INTERNAL CONTROLS

Implement segregation of duties.

Examples:

The person creating a supplier should not automatically have unlimited authority to:

* approve supplier
* create payment
* approve payment
* release payment

Support roles such as:

* Super Admin
* Company Admin
* Accountant
* Bookkeeper
* Financial Manager
* Accounts Receivable
* Accounts Payable
* Payroll
* Auditor/Reviewer
* Read-only
* External Accountant

Permissions must be granular.

---

# 39. APPROVAL WORKFLOWS

Support configurable approvals for:

* supplier creation
* customer creation
* invoices
* credit notes
* journals
* supplier payments
* refunds
* write-offs
* stock adjustments
* fixed asset disposals
* period closing
* period reopening

---

# 40. SUSPENSE ACCOUNT

Implement a suspense account.

The system must:

* identify suspense transactions
* show age
* show source
* show user
* show unresolved balance
* warn when suspense is non-zero
* include suspense in reconciliation reports

Do not hide suspense balances.

---

# 41. TRIAL BALANCE

Produce:

* detailed trial balance
* summarized trial balance
* comparative trial balance
* monthly trial balance
* year-to-date trial balance
* pre-adjustment trial balance
* post-adjustment trial balance
* closing trial balance

Must always satisfy:

TOTAL DEBITS = TOTAL CREDITS.

---

# 42. FINANCIAL STATEMENTS

The system must generate financial statements according to the entity's selected
reporting framework.

At minimum support:

## Statement of Financial Position

Assets:

* non-current assets
* current assets

Equity:

* share capital
* reserves
* retained earnings

Liabilities:

* non-current liabilities
* current liabilities

## Statement of Profit or Loss and Other Comprehensive Income

Support:

* revenue
* cost of sales
* gross profit
* operating expenses
* operating profit
* finance income
* finance costs
* profit before tax
* tax
* profit after tax
* OCI where applicable

## Statement of Changes in Equity

Support:

* opening balances
* profit/loss
* dividends
* capital movements
* reserves
* other movements

## Cash Flow Statement

Support:

* operating activities
* investing activities
* financing activities
* cash equivalents
* opening cash
* closing cash

Support the applicable method required by the reporting framework.

---

# 43. NOTES TO FINANCIAL STATEMENTS

Do not treat financial statements as only four tables.

Implement a framework for financial statement notes.

Depending on reporting framework and entity circumstances support:

* accounting policies
* property, plant and equipment
* intangible assets
* investments
* inventories
* receivables
* cash
* equity
* loans
* leases
* provisions
* tax
* deferred tax
* revenue
* expenses
* employee benefits
* related parties
* financial instruments
* commitments
* contingencies
* events after reporting period
* going concern
* subsequent events
* other required disclosures

The system should generate notes from accounting data wherever possible.

---

# 44. IFRS ACCOUNTING ENGINE

Do not implement IFRS as a superficial report template.

The underlying accounting engine must support the concepts required for relevant IFRS
accounting.

Architect for areas including:

* IAS 1 / successor presentation requirements
* IAS 2 Inventories
* IAS 7 Cash Flow Statements
* IAS 8 Accounting Policies, Changes in Accounting Estimates and Errors
* IAS 10 Events after Reporting Period
* IAS 12 Income Taxes
* IAS 16 Property, Plant and Equipment
* IAS 19 Employee Benefits
* IAS 20 Government Grants
* IAS 21 Foreign Exchange
* IAS 23 Borrowing Costs
* IAS 24 Related Parties
* IAS 27 Separate Financial Statements
* IAS 28 Associates and Joint Ventures
* IAS 32 Financial Instruments Presentation
* IAS 33 Earnings per Share
* IAS 34 Interim Reporting
* IAS 36 Impairment
* IAS 37 Provisions and Contingencies
* IAS 38 Intangible Assets
* IAS 40 Investment Property
* IAS 41 Agriculture
* IFRS 2 Share-based Payment
* IFRS 3 Business Combinations
* IFRS 5 Non-current Assets Held for Sale
* IFRS 7 Financial Instruments Disclosures
* IFRS 8 Operating Segments
* IFRS 9 Financial Instruments
* IFRS 10 Consolidated Financial Statements
* IFRS 11 Joint Arrangements
* IFRS 12 Disclosure of Interests
* IFRS 13 Fair Value Measurement
* IFRS 15 Revenue
* IFRS 16 Leases
* IFRS 17 Insurance Contracts
* IFRS 18 Presentation and Disclosure in Financial Statements
* IFRS 19 Subsidiaries without Public Accountability: Disclosures
* applicable IFRIC/SIC interpretations
* applicable amendments effective for the reporting period

Do NOT blindly activate every standard for every company.

Determine applicability.

---

# 45. IFRS 15 REVENUE

Revenue accounting must distinguish between:

* customer contract
* performance obligation
* transaction price
* allocation
* satisfaction of performance obligation
* contract asset
* contract liability
* invoice
* payment

An invoice is not automatically the same thing as revenue recognition under every
accounting circumstance.

---

# 46. IFRS 9 / FINANCIAL INSTRUMENTS

Architect for:

* receivables
* payables
* loans
* investments
* financial assets
* financial liabilities
* amortised cost
* fair value where applicable
* impairment
* expected credit losses

For receivables, support expected credit loss calculations where required by the
reporting framework.

---

# 47. IFRS 16

Where applicable, support:

* lease identification
* lease term
* discount rate
* lease liability
* right-of-use asset
* depreciation
* interest
* modifications
* remeasurement

---

# 48. IFRS 18

The application must be designed to accommodate IFRS 18 requirements for presentation
and disclosure.

Do not build the reporting engine in a way that assumes the old IAS 1 presentation
model will remain permanently unchanged.

Make financial statement presentation version-controlled.

---

# 49. IFRS FOR SMEs

Support IFRS for SMEs as a separate reporting framework.

Do not simply remove random IFRS features.

The system must have a framework engine that knows which requirements apply to:

* Full IFRS
* IFRS for SMEs
* other applicable frameworks

The 2025 third edition of IFRS for SMEs was issued in February 2025 and is effective
for periods beginning on or after 1 January 2027, with early adoption permitted.

Therefore the system must support:

* 2015 IFRS for SMEs requirements where still applicable
* 2025 edition
* effective dates
* early adoption
* transition
* comparative periods

Do not overwrite the previous standard when a new standard becomes effective.

---

# 50. DEFERRED TAX

Support:

* temporary differences
* tax base
* carrying amount
* deferred tax assets
* deferred tax liabilities
* tax rates
* recognition criteria
* movements
* reconciliation

Do not calculate deferred tax simply as:

accounting profit × tax rate.

Deferred tax is based on applicable temporary differences.

---

# 51. SOUTH AFRICAN CORPORATE INCOME TAX

Implement a separate tax computation engine.

The accounting profit must NOT automatically equal taxable income.

The system must support a tax reconciliation:

Accounting profit

PLUS/MINUS tax adjustments

=

Taxable income

Support configurable tax adjustments such as:

* non-deductible expenses
* exempt income
* capital items
* tax allowances
* recoupments
* wear-and-tear allowances
* donations
* entertainment restrictions
* penalties
* provisions
* bad debts
* interest limitations
* assessed losses
* capital gains
* other tax adjustments

Tax rules must be version-controlled.

---

# 52. CORPORATE TAX

The standard South African corporate income tax rate for the 2026/27 year remains
27%.

Do NOT hard-code this rate.

Create:

tax_rate
effective_from
effective_to
entity_type
tax_year
special_conditions

---

# 53. SMALL BUSINESS CORPORATION

Support SBC tax calculations.

The system must determine eligibility based on the applicable legislation rather than
simply asking:

"Is this a small business?"

Support:

* gross income limits
* shareholder requirements
* personal service restrictions
* ownership requirements
* applicable exclusions
* applicable tax brackets

The 2026/27 SARS SBC rates are currently:

* R0–R99,000: 0%
* R99,001–R365,000: 7%
* R365,001–R550,000: R18,620 + 21%
* R550,001+: R57,470 + 27%

These must be stored as effective-dated tax configuration, not hard-coded logic.

---

# 54. PROVISIONAL TAX

Support:

* provisional taxpayers
* first provisional payment
* second provisional payment
* top-up/third payment where applicable
* estimates
* taxable income
* tax credits
* payments
* SARS statement
* reconciliation
* underpayment/interest calculations where applicable

---

# 55. CAPITAL GAINS TAX

Separate:

ACCOUNTING PROFIT

from:

TAXABLE CAPITAL GAIN

Support:

* asset disposal
* proceeds
* base cost
* capital improvement
* selling costs
* exclusions
* annual exclusion where applicable
* inclusion rate
* taxable capital gain
* company/trust/individual treatment

Do not treat all accounting gains as ordinary taxable income.

---

# 56. DIVIDENDS

Support:

* dividend declaration
* dividend payment
* dividend withholding tax
* exemptions where applicable
* dividend tax calculations
* shareholder allocation
* payment dates
* SARS reporting data

---

# 57. PAYROLL

Although payroll is a separate subsystem, integrate it with accounting.

Support:

* employee master data
* salary
* wages
* overtime
* bonuses
* allowances
* deductions
* PAYE
* UIF
* SDL
* employer contributions
* benefits
* leave
* payroll journals
* payslips
* EMP201
* EMP501
* IRP5/IT3(a)
* tax certificates
* payroll reconciliation

Payroll liabilities must post to control accounts.

---

# 58. PAYE / UIF / SDL

Maintain separate liability accounts for:

* PAYE
* UIF employee
* UIF employer
* SDL
* other statutory deductions

Do not combine all payroll liabilities into one account.

---

# 59. TAX PERIODS

The tax engine must understand that:

ACCOUNTING YEAR

and

SARS TAX YEAR

are not necessarily the same thing.

Maintain separate calendars.

---

# 60. SARS RECONCILIATION

Support reconciliation between:

Accounting records

and

SARS submissions/statements.

For VAT:

Output VAT
minus
Input VAT
plus/minus adjustments
======================

VAT payable/refundable

For payroll:

PAYE
+
UIF
+
SDL
===

statutory payroll liability

For income tax:

Accounting profit
± tax adjustments
=================

taxable income

---

# 61. RECORD KEEPING

The system must preserve a complete audit trail.

SARS states that records must generally be retained for five years, subject to
circumstances that can extend retention requirements.

The application must therefore support configurable retention policies and must never
automatically destroy financial records merely because a transaction is old.

Store:

* source documents
* invoices
* receipts
* supplier invoices
* tax invoices
* bank statements
* journal evidence
* contracts
* asset documents
* payroll records
* tax documents
* reconciliation evidence

---

# 62. DOCUMENT MANAGEMENT

Every important accounting transaction should be capable of having attachments.

Support:

* PDF
* JPG
* PNG
* scanned documents
* receipts
* invoices
* contracts
* bank statements

Documents must be linked to the underlying transaction.

---

# 63. SOURCE DOCUMENT → ACCOUNTING ENTRY

The system must preserve the chain:

SOURCE DOCUMENT

→ TRANSACTION

→ JOURNAL

→ GENERAL LEDGER

→ SUBLEDGER

→ TRIAL BALANCE

→ FINANCIAL STATEMENTS

→ TAX REPORT

This chain must be traceable in both directions.

A user viewing a financial statement number should be able to drill down to:

financial statement
→ account
→ journal
→ source transaction
→ source document.

---

# 64. REPORTING

Implement:

* General Ledger
* Trial Balance
* Balance Sheet
* Income Statement
* Cash Flow Statement
* Statement of Changes in Equity
* VAT reports
* VAT reconciliation
* VAT return preparation
* Debtors Age Analysis
* Creditors Age Analysis
* Customer statements
* Supplier statements
* Bank reconciliation
* Inventory valuation
* Stock movement
* Fixed asset register
* Depreciation report
* Tax reconciliation
* Income tax computation
* Capital gains report
* Payroll reports
* PAYE reports
* audit trail
* journal report
* recurring transactions
* budget vs actual
* cash flow forecast
* management accounts
* financial ratios

---

# 65. MANAGEMENT ACCOUNTING

In addition to statutory accounting support:

Support:

* budgets
* forecasts
* actual vs budget
* variance analysis
* departments
* branches
* projects
* cost centres
* profit centres
* dimensions
* profitability analysis

Dimensions must NOT corrupt statutory accounting.

---

# 66. COST CENTRES

Allow:

* cost centres
* departments
* branches
* projects
* classes
* locations

Every applicable transaction should optionally carry dimensions.

Example:

DR Advertising Expense
CR Bank

Cost Centre:
Marketing

Branch:
Cape Town

Project:
Project 001

---

# 67. BUDGETS

Support:

* annual budgets
* monthly budgets
* departmental budgets
* project budgets
* budget revisions
* approved budgets
* forecast
* actual vs budget

Do not post budgets into the General Ledger.

---

# 68. PERIOD LOCKING

Implement strict period controls.

Statuses:

* Open
* Soft Closed
* Closed
* Locked

Only authorized users can reopen periods.

---

# 69. JOURNAL APPROVAL

Support:

Draft Journal
→ Submitted
→ Approved
→ Posted

Manual journals should support configurable approval thresholds.

---

# 70. CONTROL ACCOUNTS

Implement control accounts for:

* receivables
* payables
* inventory
* VAT
* payroll
* fixed assets
* loans

Subledger totals must reconcile automatically.

Example:

Customer balances total

MUST EQUAL

Trade Receivables Control Account

Any difference must be flagged.

---

# 71. RECONCILIATION CENTRE

Create a central reconciliation module.

It must show:

* bank reconciliation
* debtors reconciliation
* creditors reconciliation
* inventory reconciliation
* VAT reconciliation
* payroll reconciliation
* fixed asset reconciliation
* tax reconciliation
* control account reconciliation

Every reconciliation must have:

* status
* preparer
* reviewer
* date
* balance
* variance
* explanation
* supporting evidence

---

# 72. ERROR PREVENTION

The application must prevent:

* unbalanced journals
* duplicate invoices
* duplicate supplier invoices
* invalid VAT calculations
* negative stock where prohibited
* posting to closed periods
* deleting posted transactions
* duplicate payment allocations
* duplicate customer receipts
* invalid tax codes
* invalid account types
* orphaned journal lines
* orphaned documents
* mismatched control accounts

---

# 73. ACCOUNTING INTEGRITY

Never calculate financial reports from UI state.

Never calculate accounting totals from cached frontend values.

Never allow users to directly edit:

* trial balance totals
* account balances
* VAT control balances
* customer control balances
* supplier control balances
* retained earnings

These must be derived from posted accounting entries.

---

# 74. DATABASE DESIGN

The database must be normalized and transaction-safe.

Core tables should include concepts such as:

companies
users
roles
permissions
accounting_periods
chart_of_accounts
accounts
journals
journal_entries
journal_lines
customers
suppliers
invoices
invoice_lines
credit_notes
debit_notes
receipts
payments
payment_allocations
bank_accounts
bank_transactions
bank_reconciliations
tax_codes
tax_rates
vat_periods
vat_transactions
inventory_items
warehouses
stock_movements
stock_counts
fixed_assets
asset_movements
depreciation_runs
employees
payroll_runs
payroll_lines
tax_returns
budgets
budget_lines
projects
cost_centres
documents
audit_logs

Use foreign keys and database constraints.

---

# 75. MULTI-COMPANY

The application must support multiple companies.

Every accounting record must be tenant/company scoped.

A user must never be able to access another company's:

* transactions
* customers
* suppliers
* bank accounts
* financial statements
* payroll
* tax information
* documents

unless explicitly authorized.

---

# 76. MULTI-USER

Support:

* users
* roles
* permissions
* approval workflows
* audit trails
* login history
* session controls

---

# 77. SECURITY

Accounting data is highly sensitive.

Implement:

* authentication
* MFA where supported
* role-based access
* row-level security where applicable
* encrypted connections
* secure password handling
* session management
* audit logging
* document access control
* backup strategy
* recovery strategy

---

# 78. BACKUPS

Accounting data must be recoverable.

Implement:

* automated backups
* point-in-time recovery where infrastructure supports it
* backup verification
* disaster recovery procedure
* export capability

---

# 79. DATA IMMUTABILITY

Posted accounting records should be treated as immutable accounting events.

Corrections must create new accounting events.

Do not rewrite history.

This is one of the most important architectural rules.

---

# 80. AUDITABLE ACCOUNTING EVENT MODEL

Every accounting event must answer:

WHO?

WHAT?

WHEN?

WHY?

WHERE DID IT COME FROM?

WHAT DID IT AFFECT?

WHAT WAS THE ORIGINAL VALUE?

WHAT IS THE CORRECTED VALUE?

WHAT JOURNAL WAS CREATED?

WHAT DOCUMENT SUPPORTS IT?

---

# 81. REPORTING FRAMEWORK VERSIONING

Every financial statement must identify:

* reporting framework
* framework version
* reporting period
* accounting policies
* applicable standards
* effective dates

Do not assume accounting standards are static.

For example, IFRS for SMEs has a 2025 edition that becomes effective in 2027.

---

# 82. TAX VERSIONING

Tax configuration must be effective-dated.

For every tax rule store:

* rule
* rate
* threshold
* effective date
* expiry date
* entity type
* tax type
* source
* legislation/reference
* notes

This allows the system to reproduce historical tax calculations correctly.

---

# 83. HISTORICAL ACCURACY

If a company performs a transaction in 2026, and the tax rate changes in 2027, the
2026 transaction must remain calculated according to the rules applicable to that
transaction.

Do not retroactively change old transactions simply because the current rate changed.

---

# 84. ACCOUNTING POLICY ENGINE

Allow the company/reporting framework to define:

* inventory method
* depreciation policy
* revenue recognition policy
* capitalization thresholds
* materiality thresholds
* foreign currency policy
* impairment policy
* lease policy
* financial instrument classification
* tax accounting policy where applicable

Policies must be versioned.

---

# 85. MATERIALITY

The system should support configurable materiality thresholds.

Materiality must influence:

* disclosures
* reporting
* review workflows
* management reporting

However, materiality must NEVER be used as an excuse to corrupt the underlying ledger.

Every transaction still needs to be accurately recorded.

---

# 86. FINANCIAL STATEMENT COMPARATIVES

Support:

* current year
* previous year
* two-year comparison
* monthly comparison
* year-to-date comparison

Comparatives must be calculated using the appropriate accounting framework and
presentation rules.

---

# 87. CONSOLIDATION ARCHITECTURE

Architect for future support of:

* parent companies
* subsidiaries
* intercompany transactions
* elimination entries
* non-controlling interests
* consolidation adjustments
* consolidated financial statements

Do not design the database in a way that makes consolidation impossible later.

---

# 88. RELATED PARTIES

Support identification of:

* directors
* shareholders
* subsidiaries
* associates
* key management
* related entities
* related-party transactions

Related-party information should be available for financial statement disclosure.

---

# 89. GOING CONCERN

The system should provide management reporting capable of supporting going-concern
assessment, including:

* cash position
* liabilities
* overdue creditors
* overdue debtors
* loan maturities
* projected cash flow
* budget
* forecast

Do not automatically declare that a company is a going concern. Provide information
and warnings.

---

# 90. FRAUD AND ANOMALY CONTROLS

Implement optional accounting anomaly detection for:

* duplicate invoices
* duplicate payments
* unusual journals
* weekend postings
* backdated journals
* unusual VAT
* unusual supplier changes
* unusual bank transactions
* manual journals near year-end
* unusual write-offs
* unusual credit notes
* unusual stock adjustments

Flag suspicious activity rather than automatically changing accounting records.

---

# 91. SARS RECORD RETENTION

The system must support long-term preservation of accounting and tax records.

SARS states that taxpayers generally need to retain relevant records for five years,
with longer retention in certain situations such as ongoing audits/investigations.

Do not build automatic destructive deletion of accounting records.

---

# 92. ELECTRONIC RECORDS

Accounting records may be maintained electronically subject to applicable
requirements.

The system must ensure:

* records remain accessible
* records are readable
* records are protected
* documents are linked to transactions
* audit trail is preserved
* historical records can be reproduced

---

# 93. XBRL / STATUTORY REPORTING ARCHITECTURE

Architect for structured financial reporting.

The Companies Act framework includes XBRL reporting requirements for applicable
entities. South African government notices have provided for annual financial
statement reporting using XBRL.

Do not build statutory reporting as a PDF-only system.

---

# 94. PUBLIC-SECTOR SUPPORT

Do not mix GRAP and private-sector IFRS accounting.

If public-sector support is eventually required, create a separate reporting
framework.

GRAP provides recognition, measurement, presentation and disclosure requirements for
South African public-sector reporting.

---

# 95. IFRS ≠ TAX

This distinction MUST be enforced throughout the system.

Financial reporting profit is not necessarily taxable income.

Accounting depreciation is not automatically the tax deduction.

Accounting provisions are not automatically tax deductions.

Accounting revenue recognition is not necessarily identical to tax timing.

Therefore maintain separate:

ACCOUNTING

TAX

VAT

PAYROLL

REPORTING

layers.

---

# 96. ACCOUNTING ENGINE ARCHITECTURE

Use this conceptual architecture:

SOURCE DOCUMENTS
↓
BUSINESS TRANSACTION
↓
TAX/VAT CLASSIFICATION
↓
ACCOUNTING RULE ENGINE
↓
JOURNAL GENERATION
↓
GENERAL LEDGER
↓
SUBLEDGER RECONCILIATION
↓
TRIAL BALANCE
↓
ADJUSTMENTS
↓
FINANCIAL STATEMENTS
↓
TAX RECONCILIATION
↓
STATUTORY REPORTING

---

# 97. DO NOT BUILD FAKE ACCOUNTING

Do not create dashboards that simply add invoice totals.

Do not create financial statements from invoice tables.

Do not calculate profit from:

sales - expenses

without using the General Ledger.

The General Ledger must be the accounting source of truth.

---

# 98. DASHBOARD

The dashboard must derive information from actual accounting data.

Show:

* revenue
* gross profit
* net profit
* expenses
* cash
* receivables
* payables
* VAT payable/refundable
* tax liabilities
* stock value
* bank balances
* overdue customers
* overdue suppliers
* cash flow
* budget variance

Every dashboard number must drill down to the underlying accounting records.

---

# 99. DRILL-DOWN

Every financial number should support:

Dashboard
→ Report
→ Account
→ Journal
→ Transaction
→ Source Document

Example:

Net Profit
→ Income Statement
→ Revenue
→ Sales Account
→ Invoice
→ Customer
→ PDF invoice

---

# 100. RECONCILIATION-FIRST DESIGN

Every subsystem must reconcile to accounting.

Examples:

Invoices → Debtors → General Ledger

Supplier invoices → Creditors → General Ledger

Inventory → Inventory Control → General Ledger

Payroll → Payroll Liabilities → General Ledger

VAT → VAT Control → General Ledger

Bank → Bank Account → General Ledger

Fixed Assets → Fixed Asset Register → General Ledger

If something does not reconcile, the system must show the difference.

---

# 101. TESTING REQUIREMENTS

Create automated tests for accounting integrity.

At minimum test:

* debits equal credits
* invoice posting
* VAT
* credit notes
* debit notes
* payments
* receipts
* allocations
* bank reconciliation
* inventory
* cost of sales
* depreciation
* accruals
* prepayments
* foreign exchange
* payroll
* VAT reconciliation
* tax reconciliation
* year-end
* retained earnings
* period locking
* reversal
* audit trail

---

# 102. ACCOUNTING TEST CASES

Create realistic South African scenarios.

Example:

A VAT-registered company sells goods for R115,000 including VAT.

The system must correctly determine:

Revenue excluding VAT
VAT output
Customer receivable

Then payment must settle the receivable without creating new revenue.

Test the complete chain.

Also test:

* cash sale
* credit sale
* supplier purchase
* supplier payment
* customer payment
* credit note
* debit note
* VAT refund
* VAT payable
* stock purchase
* stock sale
* asset purchase
* asset disposal
* payroll
* loan
* interest
* foreign currency
* year-end adjustment

---

# 103. ACCOUNTING ERROR TESTING

Attempt to:

* post an unbalanced journal
* delete a posted journal
* post into a closed period
* create duplicate invoice
* use invalid VAT code
* create negative stock
* alter historical VAT
* alter historical tax
* change posted invoice total
* manipulate retained earnings

The system must reject or safely handle each case.

---

# 104. USER EXPERIENCE

Accounting software must be understandable to non-accountants without sacrificing
accounting correctness.

Users should be able to:

Create Customer
→ Create Invoice
→ Receive Payment

while the accounting engine automatically creates the correct journal.

Likewise:

Create Supplier
→ Enter Supplier Invoice
→ Pay Supplier

should automatically produce the correct accounting entries.

The user should not have to manually understand every debit and credit.

However, accountants must be able to inspect the journal generated by every
transaction.

---

# 105. ACCOUNTANT MODE

Provide an advanced accountant interface showing:

* journal
* debit
* credit
* tax
* account
* period
* source
* references
* reconciliation status
* audit trail

---

# 106. ACCOUNTING TRANSACTION PREVIEW

Before posting complex transactions, show:

DOCUMENT

Accounting impact:

DR Account X
R xxx

CR Account Y
R xxx

VAT:

Input/Output
R xxx

This allows the user to review the accounting before posting.

---

# 107. STATUTORY WARNING ENGINE

The software must warn users when:

* VAT registration threshold may have been exceeded
* VAT return is due
* tax return is due
* payroll return is due
* accounting period is closing
* bank reconciliation is outstanding
* control account doesn't reconcile
* suspense account has a balance
* overdue customer balances exist
* overdue supplier balances exist
* tax liability exists
* supporting documentation is missing
* a transaction may require accountant review

Warnings must not silently alter accounting.

---

# 108. COMPLIANCE DASHBOARD

Create a dedicated Compliance Dashboard.

Show:

VAT

* registration
* current period
* VAT payable/refund
* return status
* reconciliation status

Income Tax

* tax year
* provisional tax
* estimated liability
* reconciliation

Payroll

* PAYE
* UIF
* SDL
* EMP201
* EMP501
* certificates

Companies

* financial statements
* annual return support
* reporting framework
* Public Interest Score
* audit/review status

Accounting

* bank reconciliations
* debtors
* creditors
* inventory
* fixed assets
* suspense
* closed periods

---

# 109. SOURCE CITATION / RULE TRACEABILITY

Every significant accounting/tax rule in the system should be traceable to a source.

Store metadata such as:

rule_id
rule_name
source_type
source_name
section/reference
effective_date
expiry_date
version
notes

This is extremely important.

The software should be able to answer:

"Why did the system calculate this?"

---

# 110. NO UNSUPPORTED CLAIMS

If a rule cannot be verified from an authoritative source:

DO NOT GUESS.

Flag:

"Requires professional/accounting review."

---

# 111. PROFESSIONAL REVIEW

The software must not present itself as replacing:

* registered tax practitioners
* accountants
* auditors
* professional financial advisers
* legal advisers

The software provides accounting automation and compliance support.

Complex cases must be capable of being escalated to a professional.

---

# 112. CURRENT-DATE AWARENESS

The accounting engine must understand:

* transaction date
* document date
* posting date
* tax period
* financial year
* effective tax rule
* effective accounting standard
* effective VAT rate
* reporting framework version

Never use today's rules to incorrectly calculate historical transactions.

---

# 113. CONFIGURATION OVER HARD-CODING

Rates and thresholds must never be scattered throughout source code.

Create configuration tables/services for:

* VAT rates
* VAT thresholds
* tax rates
* SBC rates
* tax brackets
* statutory thresholds
* effective dates
* reporting standards
* financial statement mappings
* tax codes
* account mappings

---

# 114. FINAL ARCHITECTURAL PRINCIPLE

The software must behave like an accounting system, not like a database containing
financial numbers.

The correct hierarchy is:

DOCUMENT

→ BUSINESS EVENT

→ ACCOUNTING RULE

→ JOURNAL

→ GENERAL LEDGER

→ SUBLEDGER

→ TRIAL BALANCE

→ ADJUSTMENTS

→ FINANCIAL STATEMENTS

→ TAX RECONCILIATION

→ STATUTORY REPORTING

Everything must remain traceable.

---

# 115. IMPLEMENTATION REQUIREMENT

Before writing new accounting functionality:

1. Inspect the existing application.
2. Inspect the database schema.
3. Inspect existing accounting logic.
4. Inspect existing migrations.
5. Inspect existing tax/VAT logic.
6. Inspect existing reports.
7. Identify duplicate or conflicting accounting logic.
8. Do not create a second accounting engine.
9. Refactor existing functionality where appropriate.
10. Preserve working functionality.
11. Add automated tests.
12. Run reconciliation tests.
13. Verify debit/credit integrity.
14. Verify VAT.
15. Verify reporting.
16. Verify audit trail.

Do not blindly add new modules without understanding the existing accounting
architecture.

---

# 116. REQUIRED DEVELOPMENT PHASES

Build in this order:

### Phase 1 — Accounting Core

* Company
* Financial year
* Accounting periods
* Chart of accounts
* General Ledger
* Journals
* Journal lines
* Trial balance
* Audit trail

### Phase 2 — Customers

* Customers
* Sales
* Invoices
* Credit notes
* Debit notes
* Receipts
* Allocations
* Debtors ageing

### Phase 3 — Suppliers

* Suppliers
* Purchase invoices
* Credit notes
* Debit notes
* Payments
* Allocations
* Creditors ageing

### Phase 4 — Banking

* Bank accounts
* Transactions
* Imports
* Reconciliation

### Phase 5 — VAT

* Tax codes
* VAT engine
* VAT control
* VAT reconciliation
* VAT reports
* VAT return preparation

### Phase 6 — Inventory

* Products
* Warehouses
* Stock
* Movements
* Valuation
* Cost of sales

### Phase 7 — Fixed Assets

* Asset register
* Depreciation
* Disposals
* Tax register

### Phase 8 — Payroll

* Employees
* Payroll
* PAYE
* UIF
* SDL
* EMP201
* EMP501

### Phase 9 — Tax

* Income tax
* Provisional tax
* Tax reconciliation
* Capital gains
* Dividends

### Phase 10 — Financial Reporting

* Income Statement
* Statement of Financial Position
* Cash Flow
* Equity
* Notes
* Comparatives

### Phase 11 — Compliance

* Public Interest Score
* reporting framework
* audit/review status
* compliance dashboard
* statutory reporting support

### Phase 12 — Advanced Accounting

* IFRS
* IFRS for SMEs
* deferred tax
* leases
* financial instruments
* consolidation
* related parties
* foreign exchange
* impairment
* advanced disclosures

---

# 117. FINAL RULE

Do not tell me:

"this should work."

Prove it.

For every accounting module, provide:

1. database design
2. accounting logic
3. debit/credit examples
4. tax treatment
5. VAT treatment
6. reporting impact
7. audit trail
8. reconciliation
9. permissions
10. automated tests
11. edge cases
12. historical/version handling

The end result must be capable of producing accounting records that are internally
consistent, traceable, auditable and appropriate for South African business
accounting, subject to professional review where required.

**Build the accounting engine first. Build the UI around the accounting engine —
never the other way around.**
