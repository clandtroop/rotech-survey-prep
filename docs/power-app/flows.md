# PTO flows: step-by-step build

The design behind these flows is in
[../sharepoint-migration-plan.md](../sharepoint-migration-plan.md) §5. This page is the
click-by-click version for the Power Automate designer. Build both flows **under Cody's
account**: they run as Cody, which is what lets them write to the read-only TP PTO
Requests list and put events on the Team PTO calendar.

Build the SharePoint lists first (plan §3), and add `Admin` and `Approver` to TP People.
Both flows are referenced by name from the app, so name them exactly **TPSubmitPTORequest**
and **TPCancelPTORequest**, with no spaces.

## Before you start

1. **Create the Team PTO calendar.** In Outlook, go to Calendar → Add calendar → Create
   blank calendar, and name it `Team PTO`. Approved PTO lands here, and each specialist
   is invited, so it shows on their own calendar.
2. **Names matter.** Rename each action to the name in **bold** below: click the action
   title, then type. Expressions refer to actions by name, with spaces written as
   underscores. For example, an action named "Get person" is `body('Get_person')`.
3. **Expressions.** Where a step says *expression*, click into the field, choose the
   **fx** (Insert expression) button, paste the expression, and select Add. Where a step
   says *dynamic*, pick the named value from the lightning-bolt list.

---

## Flow 1: TPSubmitPTORequest

### 1. Create the flow

1. Go to make.powerautomate.com and select **Create** → **Instant cloud flow**.
2. Name it `TPSubmitPTORequest`, choose **When Power Apps calls a flow (V2)**, then
   select **Create**.
3. In the trigger, add these inputs **in this order**. The app passes them in this
   order, so a different order mixes them up.

   | # | Type | Name |
   |---|------|------|
   | 1 | Text | `LeaveType` |
   | 2 | Text | `StartDate` |
   | 3 | Text | `EndDate` |
   | 4 | Text | `DayPart` |
   | 5 | Text | `Notes` |
   | 6 | Text | `OverlapAction` |
   | 7 | Number | `Weekdays` |

### 2. Set-up values

Add these actions in order, directly under the trigger.

1. **Initialize variable**, named **Init Replaced**. Name: `Replaced`, Type: String,
   Value: leave empty.
2. **Compose**, named **Requester**. Inputs, *expression*:
   `toLower(triggerOutputs()?['headers']?['x-ms-user-email'])`
   This is the signed-in person's email, taken from their Microsoft sign-in rather than
   anything the app sends. After the first test, check it in the run history. If it's
   empty and the trigger shows `x-ms-user-email-encoded` instead, change the expression
   to `toLower(base64ToString(triggerOutputs()?['headers']?['x-ms-user-email-encoded']))`.
3. **Compose**, named **Start**. Inputs, *dynamic*: StartDate.
4. **Compose**, named **End**. Inputs, *dynamic*: EndDate.
5. **Compose**, named **Part**. Inputs, *dynamic*: DayPart.
6. **Compose**, named **StartNum**. *Expression*: `int(replace(outputs('Start'), '-', ''))`
7. **Compose**, named **EndNum**. *Expression*: `int(replace(outputs('End'), '-', ''))`
8. **SharePoint → Get items**, named **Get person**.
   - Site Address: your planner site. List Name: TP People.
   - Filter Query: type `Person/EMail eq '`, insert *dynamic* Outputs of **Requester**,
     then type `'`.
   - Top Count: `1`.
9. **Compose**, named **Approver email**. *Expression*:
   `toLower(first(body('Get_person')?['value'])?['Approver']?['Email'])`
10. **Compose**, named **PersonKey**. *Expression*:
    `first(body('Get_person')?['value'])?['PersonKey']`
11. **Compose**, named **Person name**. *Expression*:
    `first(body('Get_person')?['value'])?['Title']`

### 3. Stop early if there's no approver

1. Add a **Condition**, named **No approver**. Left side, *expression*:
   `empty(outputs('Approver_email'))`. Operator: is equal to. Right side, *expression*:
   `true`.
2. Under **True**, add **Respond to a Power App or flow**, named **Respond no approver**.
   Add three outputs, with names spelled exactly like this:
   - Text `ok` = `no`
   - Number `requestid` = `0`
   - Text `message` = `You're not on the roster yet, or no PTO approver is set for you. Ask an admin to fix it on the Roster screen.`
3. Still under **True**, after the respond, add **Terminate** with Status Succeeded.
4. Leave **False** empty. Everything from here on goes **after** the condition, not inside it.

### 4. Record the request and answer the app

1. **SharePoint → Create item**, named **Create request**. List: TP PTO Requests.
   - Title: *dynamic* Person name, then type ` · `, then *dynamic* LeaveType, then ` · `,
     then *dynamic* Start.
   - Requester Claims: *dynamic* Outputs of Requester.
   - PersonKey: Outputs of PersonKey.
   - LeaveType Value: *dynamic* LeaveType (choose **Enter custom value** first).
   - StartDate: Outputs of Start. EndDate: Outputs of End.
   - StartNum: Outputs of StartNum. EndNum: Outputs of EndNum.
   - DayPart Value: *dynamic* DayPart (custom value).
   - Weekdays: *dynamic* Weekdays.
   - Notes: *dynamic* Notes.
   - OverlapAction Value: *dynamic* OverlapAction (custom value).
   - Status Value: `Pending`.
   - Approver Claims: Outputs of Approver email.
2. **Respond to a Power App or flow**, named **Respond ok**. Use the same three outputs
   as before:
   - `ok` = `yes`
   - `requestid` = *dynamic* ID from Create request
   - `message`: leave empty

   The app now shows the request as pending. The flow keeps running and waits for the
   approver.

### 5. Ask the approver

1. **Approvals → Start and wait for an approval**. Keep the name
   **Start and wait for an approval**.
   - Approval type: **Approve/Reject – First to respond**.
   - Title: `PTO request: `, then *dynamic* Person name, then ` · `, then
     *expression* `formatDateTime(outputs('Start'), 'ddd MMM d')`, then ` to `, then
     *expression* `formatDateTime(outputs('End'), 'ddd MMM d')`.
   - Assigned to: Outputs of Approver email.
   - Details:
     ```
     LeaveType · DayPart · Weekdays weekday(s)
     Notes: Notes
     Overlapping entries: OverlapAction
     ```
     Insert the matching *dynamic* values in place of the words LeaveType, DayPart,
     Weekdays, Notes and OverlapAction.
   - Item link: *dynamic* Link to item from Create request. Item link description:
     `Open the request`.
   - Requestor (under advanced parameters): Outputs of Requester.
2. Open the action's **Settings** tab and set **Timeout** to `P28D`. Flow runs can't wait
   longer than 30 days.

### 6. Handle a request that was withdrawn meanwhile

1. **SharePoint → Get item**, named **Recheck request**. List: TP PTO Requests. Id:
   *dynamic* ID from Create request.
2. **Condition**, named **Still pending**. Left side, *expression*:
   `body('Recheck_request')?['Status']?['Value']`. Operator: is equal to. Right side:
   `Pending`.
3. Under **False**, add **Office 365 Outlook → Send an email (V2)**.
   - To: Outputs of Approver email.
   - Subject: `PTO request already withdrawn`.
   - Body: *dynamic* Person name, then ` withdrew this request before it was decided. Nothing was changed.`

Everything below goes under **True** of **Still pending**.

### 7. Rejected

1. Add a **Condition** inside True, named **Approved**. Left side, *expression*:
   `body('Start_and_wait_for_an_approval')?['outcome']`. Operator: is equal to. Right
   side: `Approve`.
2. Under **False** (rejected):
   1. **SharePoint → Update item**, named **Mark rejected**. List: TP PTO Requests.
      - Id: ID from Create request.
      - Title: Title from Create request. SharePoint requires Title on every update.
      - Status Value: `Rejected`.
      - ApproverComments, *expression*:
        `first(body('Start_and_wait_for_an_approval')?['responses'])?['comments']`
      - DecidedAt, *expression*: `utcNow()`
   2. **Send an email (V2)**.
      - To: Outputs of Requester.
      - Subject: `Your PTO request was declined`.
      - Body: `Your request for ` + Start + ` to ` + End + ` was declined.` On the next
        line: `Comment: ` + the same comments expression.

### 8. Approved: replace overlapping entries

Under **True** of **Approved**:

1. **Condition**, named **Replace chosen**. Switch the condition to an *and* group with
   two rows:
   - *dynamic* OverlapAction is equal to `Replace`
   - *dynamic* DayPart is equal to `Full day`
2. Under **True** of Replace chosen:
   1. **SharePoint → Get items**, named **Get overlapping entries**. List: TP Entries.
      - Filter Query: type `PersonKey eq '`, insert Outputs of PersonKey, then type
        `' and StartNum le `, insert Outputs of EndNum, then type ` and EndNum ge `,
        insert Outputs of StartNum.
      - Top Count: `500`.
   2. **Apply to each**. Keep the name **Apply to each**. Output from previous steps:
      *dynamic* body/value of Get overlapping entries. Inside it:
      1. **Condition**, named **Inside PTO**, as an *and* group:
         - *expression* `items('Apply_to_each')?['StartNum']` is greater than or equal
           to *expression* `outputs('StartNum')`
         - *expression* `items('Apply_to_each')?['EndNum']` is less than or equal to
           *expression* `outputs('EndNum')`
      2. **True** of Inside PTO:
         - **SharePoint → Delete item**. List: TP Entries. Id, *expression*:
           `items('Apply_to_each')?['ID']`.
         - **Append to string variable** `Replaced`, *expression*:
           `concat('Removed ', items('Apply_to_each')?['Title'], ' (', formatDateTime(items('Apply_to_each')?['StartDate'], 'MMM d'), '). ')`
      3. **False** of Inside PTO: add a **Condition**, named **Before PTO**. Use an *and*
         group: `items('Apply_to_each')?['StartNum']` is less than `outputs('StartNum')`,
         *and* `items('Apply_to_each')?['EndNum']` is less than or equal to
         `outputs('EndNum')`.
         - **True** of Before PTO: the entry starts earlier, so end it on the weekday
           before the PTO.
           - **SharePoint → Update item**. List: TP Entries. Id:
             `items('Apply_to_each')?['ID']`. Title: `items('Apply_to_each')?['Title']`.
           - EndDate, *expression*:
             `addDays(outputs('Start'), if(equals(dayOfWeek(outputs('Start')), 1), -3, if(equals(dayOfWeek(outputs('Start')), 0), -2, -1)), 'yyyy-MM-dd')`
           - EndNum, *expression*: the same expression wrapped as
             `int(replace(<that expression>, '-', ''))`.
           - **Append to string variable** `Replaced`:
             `concat('Shortened ', items('Apply_to_each')?['Title'], ' to end before the PTO. ')`
         - **False** of Before PTO: add a **Condition**, named **After PTO**. Use an
           *and* group: `items('Apply_to_each')?['StartNum']` is greater than or equal
           to `outputs('StartNum')`, *and* `items('Apply_to_each')?['EndNum']` is
           greater than `outputs('EndNum')`.
           - **True** of After PTO: the entry runs on afterwards, so start it on the
             weekday after the PTO.
             - **Update item**. Same Id and Title as above.
             - StartDate, *expression*:
               `addDays(outputs('End'), if(equals(dayOfWeek(outputs('End')), 5), 3, if(equals(dayOfWeek(outputs('End')), 6), 2, 1)), 'yyyy-MM-dd')`
             - StartNum: that expression wrapped in `int(replace(..., '-', ''))`.
             - **Append to string variable**:
               `concat('Shortened ', items('Apply_to_each')?['Title'], ' to start after the PTO. ')`
           - **False** of After PTO: the entry spans the whole PTO. **Append to string
             variable**:
             `concat('Left ', items('Apply_to_each')?['Title'], ' in place: it runs past both ends of the PTO, so adjust it by hand. ')`

### 9. Approved: add the PTO

Still under **True** of **Approved**, after **Replace chosen**:

1. **SharePoint → Create item**, named **Create PTO entry**. List: TP Entries.
   - Title: Person name + ` · ` + LeaveType.
   - PersonKey: Outputs of PersonKey. PersonName: Outputs of Person name.
   - OwnerEmail: Outputs of Requester.
   - StartDate / EndDate: Outputs of Start / End.
   - StartNum / EndNum: Outputs of StartNum / EndNum.
   - DayPart Value: DayPart (custom value).
   - Status Value: *dynamic* LeaveType (custom value). "PTO" and "Flex Holiday" are both
     Status choices.
   - Notes: Notes.
   - RequestId: ID from Create request.
2. **Office 365 Outlook → Create event (V4)**. Keep the name **Create event (V4)**.
   - Calendar id: **Team PTO**.
   - Subject: Person name + ` — ` + LeaveType.
   - Start time, *expression*:
     `concat(outputs('Start'), if(equals(outputs('Part'), 'PM'), 'T13:00:00', if(equals(outputs('Part'), 'AM'), 'T08:00:00', 'T00:00:00')))`
   - End time, *expression*:
     `if(equals(outputs('Part'), 'AM'), concat(outputs('End'), 'T12:00:00'), if(equals(outputs('Part'), 'PM'), concat(outputs('End'), 'T17:00:00'), concat(addDays(outputs('End'), 1, 'yyyy-MM-dd'), 'T00:00:00')))`
   - Time zone: **(UTC-06:00) Central Time (US & Canada)**, or the team's zone.
   - Required attendees: Outputs of Requester.
   - Is all day event, *expression*: `equals(outputs('Part'), 'Full day')`
   - Show as: **Out of office**. Is reminder on: **No**.
   - Body: `Approved through the Team Planner.`
3. **SharePoint → Update item**, named **Mark approved**. List: TP PTO Requests.
   - Id: ID from Create request. Title: Title from Create request.
   - Status Value: `Approved`.
   - ApproverComments: the same comments expression as in step 7.
   - DecidedAt: `utcNow()`.
   - OutlookEventId: *dynamic* Id from Create event (V4).
   - ReplacedSummary: *dynamic* variable Replaced.
4. **Send an email (V2)**.
   - To: Outputs of Requester.
   - Subject: `Your PTO is approved`.
   - Body: `Approved: ` + Start + ` to ` + End + `. It's on the Team Planner, and an Outlook invite is on its way.`
     On a new line: variable Replaced.

### 10. Expire requests nobody answers

1. Hover between **Start and wait for an approval** and **Recheck request**. Select
   **+** → **Add a parallel branch**, then add **SharePoint → Update item**, named
   **Mark expired**.
   - List: TP PTO Requests. Id and Title from Create request. Status Value: `Expired`.
2. In **Mark expired** → **Settings** → **Run after**, untick *is successful* and tick
   **has timed out**.
3. After it, add **Send an email (V2)**.
   - To: Outputs of Requester. Cc: Outputs of Approver email.
   - Subject: `PTO request expired`.
   - Body: `Nobody answered within 28 days, so the request expired. Request it again from the Team Planner if it's still needed.`

### 11. Run as Cody, not as the person using the app

Save the flow and go back to its details page. Under **Run only users**, select **Edit**.
Under **Connections used**, set every connection to **Use this connection** (Cody's).
Without this, the flow would try to run as each specialist, and specialists can't write
to TP PTO Requests.

---

## Flow 2: TPCancelPTORequest

1. Create an **Instant cloud flow** named `TPCancelPTORequest`, with the trigger
   **When Power Apps calls a flow (V2)**. Add one input: Number `RequestId`.
2. **Compose**, named **Caller**. *Expression*:
   `toLower(triggerOutputs()?['headers']?['x-ms-user-email'])`
   Use the encoded variant if Flow 1 needed it.
3. **SharePoint → Get item**, named **Get request**. List: TP PTO Requests. Id:
   *dynamic* RequestId.
4. **SharePoint → Get items**, named **Get caller as admin**. List: TP People.
   - Filter Query: `Person/EMail eq '` + Outputs of Caller + `' and Admin eq 1`.
   - Top Count: `1`.
5. **Condition**, named **Allowed**. Switch it to an *or* group:
   - *expression* `toLower(body('Get_request')?['Requester']?['Email'])` is equal to
     *expression* `outputs('Caller')`
   - *expression* `length(body('Get_caller_as_admin')?['value'])` is greater than `0`
6. Under **False**:
   - **Respond to a Power App or flow**. Text `ok` = `no`. Text `message` =
     `You can only cancel your own requests.`
   - **Terminate**, Succeeded.
7. After the condition, add a **Switch**. On, *expression*:
   `body('Get_request')?['Status']?['Value']`
8. **Case "Pending"** (Equals `Pending`):
   1. **Update item** in TP PTO Requests. Id: RequestId. Title:
      `body('Get_request')?['Title']`. Status Value: `Cancelled`.
   2. **Send an email (V2)**.
      - To, *expression*: `body('Get_request')?['Approver']?['Email']`
      - Subject: `PTO request withdrawn — no action needed`.
      - Body: *expression* `body('Get_request')?['Title']`, then type
        ` was withdrawn. If the approval is still in your inbox, you can ignore it.`
   3. **Respond to a Power App or flow**. `ok` = `yes`, `message` empty.
9. **Case "Approved"** (Equals `Approved`):
   1. **Get items** from TP Entries, named **Get request entries**. Filter Query:
      `RequestId eq ` + *dynamic* RequestId.
   2. **Apply to each** over its value → **Delete item** from TP Entries. Id:
      `items('Apply_to_each')?['ID']`.
   3. **Condition**: *expression* `empty(body('Get_request')?['OutlookEventId'])` is
      equal to `false`. Under True, add **Office 365 Outlook → Delete event (V2)**.
      Calendar: Team PTO. Id: `body('Get_request')?['OutlookEventId']`. Outlook sends
      the specialist a cancellation, which takes it off their calendar.
   4. **Update item** in TP PTO Requests. Id: RequestId. Title: as above. Status Value:
      `Cancelled`.
   5. **Send an email (V2)** to the approver.
      - Subject: `Approved PTO cancelled`.
      - Body: Title + ` was cancelled and removed from the Team Planner.`, then on a new
        line: *expression* `body('Get_request')?['ReplacedSummary']`, then
        ` Entries removed when it was approved are in the site recycle bin if they need restoring.`
   6. **Respond to a Power App or flow**. `ok` = `yes`.
10. **Default** case: **Respond to a Power App or flow**. `ok` = `no`, `message` =
    `This request is already ` + Status + `.`
11. Set **Run only users** → **Use this connection** for every connection, as in
    Flow 1, step 11.

Every Respond action in a flow must declare the same output names. That's `ok`,
`requestid` and `message` in Flow 1, and `ok` and `message` in Flow 2. The app reads
them as `.ok`, `.requestid` and `.message`.

---

## Test before the team uses it

Test with one specialist and one approver who aren't you. You can't approve your own
request.

- [ ] Request a full week of PTO with no overlaps. The approver's email arrives. Approve
      it. The PTO appears on Whereabouts, an invite is on the specialist's calendar, and
      My PTO shows Approved.
- [ ] Request a day that already has Home Office, with "Replace these". After approval,
      the Home Office entry is gone and ReplacedSummary says so.
- [ ] Request a Mon–Fri over a 3-day site visit that starts the Friday before. The visit
      is shortened to end on that Friday.
- [ ] Request an AM half day. The calendar shows "PTO AM", and the Outlook event runs
      8–12.
- [ ] Reject a request. The requester gets the comment, and the calendar is unchanged.
- [ ] Withdraw a pending request, then approve it from the old email. Nothing changes,
      and the approver is told it was withdrawn.
- [ ] Cancel an approved request. The entry and the Outlook event disappear, and the
      approver is emailed.
- [ ] Remove someone's approver on the Roster screen and try to request. The app shows
      the "no approver" message.
- [ ] Check the Outlook invite on the specialist's side. If it shows as Tentative until
      they accept, decide whether that's fine. Plan §9 has the alternative.
