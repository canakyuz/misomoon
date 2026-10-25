---
title: "Form abandonment: find the field people quit on"
description: Form abandonment is the share of people who start a form and never send it. Learn to measure starts, submissions, and the field where they stop, then fix it.
tags: behavior, how-to
status: draft
---

Form abandonment is the share of people who start filling in a form and leave without sending it. To measure it, count form starts and submissions, then find the last field people touched before they left. That field, and the one after it, tell you where to look first.

This guide covers how form analytics works, the usual causes of abandonment, and how to measure it in misomoon without recording anything people type.

## What form abandonment measures

A form has more stages than "seen" and "sent". Keep them apart, because each one answers a different question:

- **A view** is a visit to the page that holds the form. Many visitors never mean to fill it in.
- **A start** is the first time a visitor focuses a field in the form. They clicked or tabbed into it, so they meant to use it.
- **A submission** is the moment the visitor sends the form.
- **A success** is a submission that your server accepted. A submission can still fail on the server, for example when an email address is already taken.

Form abandonment compares starts with submissions. The abandonment rate is the starts minus the submissions, divided by the starts. The completion rate is the submissions divided by the starts, and the two rates add up to 100%.

Here is an example with made-up numbers. A signup form gets 1,000 starts and 640 submissions in a month. Its completion rate is 64%, and its abandonment rate is 36%. The 360 people who left are the ones worth studying, because they wanted to sign up and something stopped them.

### Why the exit field matters more than the rate

The rate tells you that a form loses people. It doesn't tell you why. Field-level data does. For each field, form analytics counts how many visits used it and how many left the form while it was the last field they touched.

Read the exit field with care. If most people leave at `email`, the email field may be the problem, but the field after it may be the real one. A visitor who fills in their email, sees a required phone number below, and closes the tab leaves at `email`. They never focused the phone field, so it never shows as the field they left at. Look at the exit field and at the next field in page order together.

## How to measure form abandonment

You need three signals from the browser, and none of them needs the text people type:

1. Listen for focus on the form's fields. The first focus in a form counts a start. Each focus also records which field the visitor is in.
2. Listen for the form's `submit` event. A submit counts a submission.
3. When the visitor leaves the page, check whether the form was sent. If it wasn't, the last field they focused is the field they left at.

Add up those counts per form and per field across all visits.

Two choices make the data more useful:

- **Name every form.** A stable `id` or `name` on the `<form>` element keeps the counts together when you redesign the page.
- **Name every field.** A field called `email` reads better in a report than the third input on the page.

To count successes as well as submissions, send a separate event after your server accepts the form, or count visits to the thank-you page. The gap between submissions and successes counts people who tried, got an error, and gave up.

## Common mistakes that make the numbers lie

**Dividing by page views.** A contact page that most people read for the address will show a high abandonment rate against views, even if everyone who starts the form sends it. Divide by starts.

**Treating a submission as a success.** If the server rejects half the submissions, a 90% completion rate hides a broken form. Count the thank-you page or a server-side event as well.

**Recording field values.** You don't need what people typed to find where they stop, and storing it puts names, email addresses, and card numbers in your analytics. Count fields, not their contents.

**Mixing forms together.** A login form, a newsletter box in the footer, and a checkout form have nothing in common. Report them separately.

**Reading small numbers.** Thirty starts is too few to act on. Pick a longer period first.

**Ignoring the device.** A form that works on a laptop can lose people on a phone, where every extra field costs more. Compare the numbers by device.

## Why people abandon forms, and how to fix it

Once you know which field loses people, look for the causes below. The fixes come from the [GOV.UK Service Manual](https://www.gov.uk/service-manual/design/form-structure), the [GOV.UK Design System](https://design-system.service.gov.uk/), and the [W3C Web Accessibility Initiative](https://www.w3.org/WAI/tutorials/forms/).

### The form asks for more than it needs

Every field is one more reason to leave. GOV.UK recommends a [question protocol](https://www.gov.uk/service-manual/design/form-structure). Before you build the form, list each piece of information and write down why you need it, what you will do with it, and how you will check it. A field nobody can justify comes out.

### People find out late that the form isn't for them

If a visitor fills in six fields and only then learns that you don't ship to their country, they leave. The [GOV.UK Service Manual](https://www.gov.uk/service-manual/design/form-structure) says to start with the questions that tell users they aren't eligible, so you don't waste their time. Use branching so each person sees only the questions that apply to them.

### One long page asks too much at once

GOV.UK's [question pages pattern](https://design-system.service.gov.uk/patterns/question-pages/) recommends one question per page, because it helps users understand what you are asking and focus on that question and its answer. The [W3C forms tutorial](https://www.w3.org/WAI/tutorials/forms/) gives the same advice for long forms. Divide them into smaller steps, and show people where they are.

### Labels and instructions leave people guessing

A field with only placeholder text, or a format nobody explains, stops people. The [W3C forms tutorial](https://www.w3.org/WAI/tutorials/forms/) says to give every control a label, with the `<label>` element as the main method, and to give instructions for the whole form and for each control that needs them. The [W3C validation tutorial](https://www.w3.org/WAI/tutorials/forms/validation/) adds that required fields need to be marked in the label, not only with the `required` attribute.

### Error messages are vague, or wipe the answers

A message such as "An error occurred" leaves the visitor to find the problem. The [GOV.UK error message guidance](https://design-system.service.gov.uk/components/error-message/) says to explain what went wrong and how to fix it, in plain English, with words from the question's label. It also says to sum up all errors at the top of the page, and to keep every answer when you show an error, both the right ones and the wrong ones. A form that clears its fields after an error makes people start again.

### The form rejects reasonable input

A phone number with spaces or a postcode in lower case is still the right answer. The [W3C validation tutorial](https://www.w3.org/WAI/tutorials/forms/validation/) says validation should accept as many forms of input as it can for each type of data, and that users should be able to check and correct what they entered.

### People have to type the same thing twice

Asking for a delivery address and then the same billing address, with no way to copy it, adds work. [WCAG 2.2 success criterion 3.3.7, Redundant Entry](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html) (Level A), requires that information the user already entered in the same process is filled in for them or offered to select, with exceptions for security and for information that is no longer valid. [Success criterion 1.3.5, Identify Input Purpose](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html) (Level AA), asks you to mark common fields in code. In HTML, the `autocomplete` attribute does that, and browsers can then fill in saved values so the user doesn't have to type them:

```html
<label for="email">Email address</label>
<input id="email" name="email" type="email" autocomplete="email">
```

### Signing in blocks paste or password managers

A login or signup step that blocks paste forces people to remember and retype a password. [WCAG 2.2 success criterion 3.3.8, Accessible Authentication (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html) (Level AA), says that a step that blocks pasting into the password field, or blocks password managers from filling it, fails the criterion unless another method is available.

### The form times out

A session that expires while someone looks for their card loses the answers and the customer. [WCAG 2.2 success criterion 2.2.1, Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) (Level A), requires that users can turn off or adjust a time limit, or get a warning and at least 20 seconds to extend it, unless an exception applies, such as a limit longer than 20 hours.

## Measure form abandonment in misomoon

misomoon's **Forms** report, in the **Behavior** view, shows starts, submissions, and the field where people stopped, for each form on your site. It comes from the **Form fields** (`fields`) feature of the tracker, which collects the fields a visit used and the one it left a form at. A second feature, **Form submits** (`forms`), sends a `Form sent` event for each form, named by its `id` or `name`. Goals and funnels can count that event. The [tracking guide](https://docs.misomoon.com/tracking#see-what-people-do-on-a-page) has the full reference.

To see the report on sample data first, open the [demo dashboard](/demo).

### Turn on the form features

1. In the dashboard, open **Settings** > **Install**.
2. In the **What to track** card, tick **Form fields** and **Form submits**. The **Everything** preset, which a new site starts with, already has both. The **Light** preset has **Form submits** but not **Form fields**.
3. Select **Save**.

A change in the settings reaches visitors within about six minutes. [Choose what to track](https://docs.misomoon.com/tracking#choose-what-to-track) lists what every feature adds to the tracker's size.

If **Form fields** is off, the **Forms** report says so, and **Open settings** takes you to the card.

### Name your forms and fields

misomoon names each form by its `id` or `name`, or by the page path when it has neither, and each field by its name, then its `id`. Give both a stable value:

```html
<form id="signup" action="/signup" method="post">
	<label for="signup-email">Email address</label>
	<input id="signup-email" name="email" type="email" autocomplete="email" required>
	<label for="signup-company">Company</label>
	<input id="signup-company" name="company" autocomplete="organization">
	<button type="submit">Create account</button>
</form>
```

To leave a form out, such as a login form you don't want to study, add `data-misomoon-ignore`. It leaves the form out of the **Forms** report and the `Form sent` event:

```html
<form id="login" data-misomoon-ignore>
```

To turn field tracking off on some pages only, put `data-disable` on the script tag of those pages:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site" data-disable="fields"></script>
```

### Read the Forms report

1. Open **Behavior**, or press `5`.
2. Select the **Forms** report.
3. Pick a period at the top right, such as **30 days**.

Each form shows its starts and submissions, and lists its fields in page order. For each field, you see how many visits used it and how many left the form there. Start with the field that has the most people leaving, then check the field after it.

A filter narrows every number in every view, so you can split the report. Filter by device to compare phones with desktops, or by a source to see whether people from one campaign give up more often. [Use the dashboard](https://docs.misomoon.com/dashboard#filter-the-dashboard) explains filters and saved segments.

### Turn a sent form into a goal and a funnel

To count sent forms as conversions, add a goal:

1. Open **Settings** and pick the **Goals** tab.
2. In **Goal type**, pick **Event**.
3. Type `Form sent`.
4. Select **Add**.

The **What they did** panel in **Overview** then shows the goal's rate and people. Goals read data you already collected, so a new goal shows past periods right away.

To count successes and not only submissions, add a **Page** goal for your thank-you page, such as `/thanks`. To see the whole path, open **Funnels** and build three steps. Use **Visits page** `/signup`, then **Triggers event** `Form sent`, then **Visits page** `/thanks`. The drop between the last two steps is the people who sent the form and never reached the thank-you page. [Goals, funnels, and paths](https://docs.misomoon.com/conversions) covers funnel modes and matching rules.

### Read the same numbers from the API or an AI assistant

`GET /api/v1/stats/behavior` with `report=forms` returns each form's `starts`, `submissions`, and `conversion`, and its `fields` in page order with `interactions` and `dropoffs`:

```sh
curl -H "Authorization: Bearer $KEY" \
	"https://app.misomoon.com/api/v1/stats/behavior?site=shop&period=30d&report=forms"
```

In Claude, Cursor, or another MCP client, the `get_page_interactions` tool returns the same report ([MCP guide](https://docs.misomoon.com/mcp)).

## What misomoon never records

The tracker never sends a field's value. Form fields carry names and flags only, so the report knows that a visit used the `email` field, and never which address the visitor typed. misomoon doesn't record sessions or keystrokes.

The **Behavior** reports keep counts per page and per element, never the path of one visit through the site. The tracker sets no cookies, and misomoon never stores the IP address.

Form fields still collect more than pageviews do. misomoon's [compliance guide](https://docs.misomoon.com/compliance) lists form fields among the features that add the most to what you need to explain in your privacy policy, and **Settings** > **Install** > **Privacy** gives you text for that policy based on what your site collects. Whether you need consent depends on your setup and your country. This is not legal advice.

## Questions people ask

### What is a good form abandonment rate?

No single number fits every form. A newsletter box with one field and a loan application with forty have nothing in common. Measure your own form for a few weeks, then judge each change against that baseline.

### Does misomoon record what people type in a form?

No. The tracker sends which fields a visit used and the field where it left, never a field's value. misomoon also never records sessions or keystrokes.

### How do I measure a multi-step form?

Give each step's form its own `id`, so each step shows as its own form in the **Forms** report. If each step has its own URL, build a funnel in **Funnels** with one **Visits page** step per URL to see how many people reach each step.

### How do I keep a login or payment form out of the report?

Add `data-misomoon-ignore` to the `<form>` element. misomoon then leaves that form out of the **Forms** report and sends no `Form sent` event for it. To turn field tracking off on whole pages, add `data-disable="fields"` to the script tag on those pages.

### Can I see the Forms report for one page?

Yes. Filter the dashboard by the page with **is**, and the **Forms** report counts only that page. The API takes a `page` parameter for the same purpose, and the `get_page_interactions` tool works for the site or for one page.

## Start measuring your forms

[Start a free trial of misomoon Cloud](https://app.misomoon.com/?signup) and add your site. Plans start at $5 a month for 100,000 events, and every plan has the **Forms** report and every other feature, so you can [see the plans](/pricing) when your traffic grows. If you would rather run it in your own Cloudflare account, misomoon is also [open source and self-hostable](https://docs.misomoon.com/self-hosting).
