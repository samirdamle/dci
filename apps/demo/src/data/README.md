# Summit Gear Co. demo org

**Fictional.** Summit Gear Co. and every account, person, email address and number here are made
up. This data is not affiliated with, endorsed by or derived from Salesforce; it only borrows the
_shape_ of a Salesforce org (18-character ids with standard key prefixes, API-style field names)
so the demo feels familiar.

- `generateOrg(today, seed)` builds the whole org from a seeded PRNG. The same seed and date always
  give the same records; dates are relative to `today`, so dashboards always look current.
- `createOrgStore(data)` is a small in-memory store (`list`, `get`, `getById`, `update`, `create`,
  `subscribe`) shared by the UI, the mock responder and the Claude backend. Client actions
  (`updateRecord`, `createTask`) write through it, and the UI re-renders from `subscribe`.

| Sales Cloud                              | Marketing Cloud                              |
| ---------------------------------------- | -------------------------------------------- |
| User `005`, Account `001`, Contact `003` | Campaign `701`, Email send `a0S`             |
| Opportunity `006` (+ line items `00k`)   | Journey `a0J` with nested steps `a0T`        |
| Lead `00Q`, Task `00T`                   | Segment `a0G`, 12 months × 5 channel metrics |

**Story hooks** worth asking the AI about:

- three open opportunities past their close date ("Waiting on customer")
- _Spring Trail Webinar_: $42k spent for 18 leads
- the _"LAST CHANCE!!!"_ email send with a ~4% open rate
- _New Customer Onboarding_ › _Gear care tips email_ with a 62% drop-off
- _Jordan Park_ (Ridgeline Outfitters): a hot lead nobody has contacted

**Privacy fixtures:** `Account.CreditLimit` and `Contact.PersonalMobile` are rendered but annotated
`private`, so they can never be selected or sent.
