\# Playbooks Reference - AccountFinanceZone (iMagiNarratives)



\*\*Google Drive Master Source\*\*  

https://drive.google.com/drive/folders/1FP4VN-cDh9l1CM5ce0YfLsyCuydzjUWm?usp=drive\_link



\*\*Standard Workflow\*\*:

1\. iMagiNarratives creates/edits playbooks in Google Drive (source of truth).

2\. eCommsZone pulls pre-composed content for delivery.

3\. HumanContactZone provides human approval for financial/recovery flows.

4\. AccountFinanceZone receives acceptance events and performs immutable ledger adjustments (token extensions, rebates, points, payouts, tier changes, Diamond purchases, etc.).



\*\*Current Playbooks in Scope for AccountFinanceZone\*\*:

\- Token Extension Acceptance

\- Partial Rebate Processing (2/3 and 3/5)

\- Points / Loyalty Adjustments

\- Diamond Tier Purchase Contracts

\- Payout / Reward Redemption

\- Any ledger-mutating acceptance



\*\*Template for Individual Playbooks\*\* (use in Drive):

\- Revision Date: 

\- Approved by: \*\*Kevin B. Hartley, CEO\*\* \[Approval Date] \[E-Signature / Drive Comment]



\*\*Local Stubs\*\*:

See src/cs-recovery-tools/ (shared) and event handlers for immutable adjustments.



This ensures all financial changes are traceable and compliant.

