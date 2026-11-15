// Built-in template library. Every template uses the QuickText command syntax
// (see docs/TEMPLATE_SYNTAX.md) and is covered by tests/unit/library.test.ts.
import type { ContentType } from '../shared/types';
import { LIBRARY_PRO } from './templates-pro';

export interface LibraryTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  shortcut: string;
  contentType: ContentType;
  content: string;
  tags?: string[];
}

export const LIBRARY_CATEGORIES = [
  'Market analysis', 'Trade signals', 'Trade management', 'Risk & journal', 'VIP channel',
  'Professional email', 'WhatsApp', 'Payments', 'Customer support', 'Office', 'College administration',
  'Admissions', 'Attendance', 'Trading', 'Social media', 'Meetings', 'Follow-up', 'Sales & proposals', 'Personal',
];

const LIBRARY_BASE: LibraryTemplate[] = [
  {
    id: 'lib-email-signature', name: 'Email signature', category: 'Professional email', shortcut: '/sig', contentType: 'text',
    description: 'Your signature from Settings → Profile.',
    content: '{{me.signature}}',
  },
  {
    id: 'lib-email-intro', name: 'Professional introduction', category: 'Professional email', shortcut: '/intro', contentType: 'text',
    description: 'Introduce yourself to a new contact.',
    content: `Dear {{text: recipient; label=Recipient name; required}},

I hope this message finds you well. My name is {{me.name}}, {{me.title}} at {{me.company}}. I am reaching out regarding {{textarea: purpose; label=Purpose of the email; required}}.

I would welcome the opportunity to discuss this further at your convenience.

Kind regards,
{{me.name}}`,
  },
  {
    id: 'lib-email-ooo', name: 'Out of office reply', category: 'Professional email', shortcut: '/ooo', contentType: 'text',
    description: 'Auto-reply with return date and backup contact.',
    content: `Thank you for your email. I am out of the office until {{date: back; label=Back on; default=+7d; format=dddd, D MMMM}} with limited access to email.
{{section: backup; label=Add a backup contact?; default=yes}}
For urgent matters, please contact {{text: backup_name; label=Backup name}} at {{text: backup_email; label=Backup email; pattern=email}}.
{{endsection}}
I will respond as soon as possible after my return.

Best regards,
{{me.name}}`,
  },
  {
    id: 'lib-email-thanks', name: 'Thank-you note', category: 'Professional email', shortcut: '/thx', contentType: 'html',
    description: 'Rich-text thank-you email.',
    content: `<p>Hi {{name}},</p><p>Thank you so much for {{text: reason; label=Thank them for; placeholder=your time yesterday}}. I <b>really</b> appreciate it.</p><p>Best,<br>{{me.name}}</p>`,
  },
  {
    id: 'lib-wa-greeting', name: 'WhatsApp greeting', category: 'WhatsApp', shortcut: '/hi', contentType: 'text',
    description: 'Time-aware friendly greeting.',
    content: '{{= greeting()}} {{name}}! 👋 Hope you are doing well.',
  },
  {
    id: 'lib-wa-order', name: 'WhatsApp order confirmation', category: 'WhatsApp', shortcut: '/order', contentType: 'text',
    description: 'Itemised order with automatic total.',
    content: `Hi {{customer}}, your order is confirmed ✅

{{repeat: items; label=Item}}{{text: item; required; hidden}}{{number: qty; default=1; min=1; hidden}}{{currency: price; label=Unit price; required; hidden}}• {{item}} × {{qty}} = {{= qty * price; format=currency}}
{{endrepeat}}
{{currency: delivery; label=Delivery charge; default=0; hidden}}*Total: {{= sum(items.qty * items.price) + delivery; format=currency}}*
Expected delivery: {{date: eta; label=Delivery date; default=+2bd; format=ddd, D MMM}}

Thank you for shopping with {{me.company}}!`,
  },
  {
    id: 'lib-pay-reminder', name: 'Payment reminder', category: 'Payments', shortcut: '/payment', contentType: 'text',
    description: 'Polite reminder with amount and deadline; tone changes when overdue.',
    content: `Dear {{name}},

{{toggle: overdue; label=Payment is already overdue?}}{{if: overdue}}This is a reminder that your payment of {{currency: amount; required; min=0}} for invoice {{text: invoice; label=Invoice #}} is now overdue. Kindly settle it by {{date: deadline; default=+3d}} to avoid any late fees.{{else}}Your payment of {{amount}} for invoice {{invoice}} is pending. Kindly complete it before {{deadline}}.{{endif}}

If you have already made the payment, please ignore this message.

Regards,
{{me.name}}
{{me.company}}`,
  },
  {
    id: 'lib-pay-receipt', name: 'Payment received', category: 'Payments', shortcut: '/paid', contentType: 'text',
    description: 'Acknowledge a payment with remaining balance.',
    content: `Hi {{name}}, we have received your payment of {{currency: paid; required}} on {{date: on; default=today}}. Thank you!
{{currency: total; label=Total invoice amount; hidden}}{{if: total > paid}}Remaining balance: {{= total - paid; format=currency}}.{{else}}Your account is fully settled. ✅{{endif}}`,
  },
  {
    id: 'lib-pay-invoice', name: 'Invoice summary with tax', category: 'Payments', shortcut: '/invoice', contentType: 'text',
    description: 'Line items, discount and tax with a dynamic table.',
    content: `Invoice for {{text: client; required}} — {{today; format=DD MMM YYYY}}

{{repeat: lines; label=Line item}}{{text: description; hidden}}{{number: qty; default=1; hidden}}{{currency: rate; hidden}}{{endrepeat}}{{table: lines; columns=Description:description|Qty:qty|Rate:rate|Amount:qty*rate; formats=||currency|currency}}

{{set: subtotal = sum(lines.qty * lines.rate)}}{{number: discount_pct; label=Discount %; default=0; min=0; max=100; hidden}}{{number: tax_pct; label=Tax %; default=18; hidden}}Subtotal: {{= subtotal; format=currency}}
{{if: discount_pct > 0}}Discount ({{discount_pct}}%): -{{= percentof(discount_pct, subtotal); format=currency}}
{{endif}}Tax ({{tax_pct}}%): {{= percentof(tax_pct, discount(subtotal, discount_pct)); format=currency}}
Total due: {{= addpercent(discount(subtotal, discount_pct), tax_pct); format=currency}}
Due date: {{date: due; default=+14d}}`,
  },
  {
    id: 'lib-support-ack', name: 'Ticket acknowledgement', category: 'Customer support', shortcut: '/ack', contentType: 'text',
    description: 'Acknowledge a support ticket with SLA by priority.',
    content: `Hi {{customer}},

Thank you for contacting {{me.company}} support. Your ticket #{{text: ticket; required}} has been created.
{{select: priority; options=Low,Normal,High,Urgent; default=Normal; hidden}}Priority: {{priority}} — we aim to respond within {{= choose(priority, "Urgent", "2 hours", "High", "8 hours", "Normal", "1 business day", "3 business days")}}.

Best regards,
{{me.name}}`,
  },
  {
    id: 'lib-support-refund', name: 'Refund approved', category: 'Customer support', shortcut: '/refund', contentType: 'text',
    description: 'Confirms a refund and expected timeline.',
    content: `Hi {{customer}}, your refund of {{currency: amount; required}} has been approved. It should reach your {{select: method; options=original payment method,bank account,store credit}} within {{number: days; default=5}} business days (by {{= formatdate(addbusinessdays(today(), days), "D MMM")}}).`,
  },
  {
    id: 'lib-support-close', name: 'Ticket closing', category: 'Customer support', shortcut: '/close', contentType: 'text',
    description: 'Close a ticket and ask for feedback.',
    content: `Hi {{customer}}, I'm glad we could resolve this for you! I'll mark this ticket as solved. If anything else comes up, just reply to this message.{{checkbox: survey; label=Include survey link; default=yes; hidden}}{{if: survey}}

We'd love your feedback: {{link: https://example.com/survey; text=2-minute survey; plain=url}}{{endif}}

{{me.name}}`,
  },
  {
    id: 'lib-office-leave', name: 'Leave request', category: 'Office', shortcut: '/leave', contentType: 'text',
    description: 'Leave application with automatic day count.',
    content: `Dear {{text: manager; label=Manager name}},

I would like to request {{select: type; options=annual leave,sick leave,personal leave,work from home}} from {{date: from; default=+1d; format=ddd D MMM}} to {{date: to; default=+2d; format=ddd D MMM YYYY}} ({{= datediff(from, to) + 1}} day(s)).

Reason: {{textarea: reason; required}}

{{checkbox: handover; label=Mention work handover; default=yes; hidden}}{{if: handover}}I will ensure my pending tasks are handed over to {{text: colleague}} before I leave.
{{endif}}
Thank you,
{{me.name}}`,
  },
  {
    id: 'lib-office-announce', name: 'Team announcement', category: 'Office', shortcut: '/announce', contentType: 'html',
    description: 'Formatted internal announcement.',
    content: `<p><b>📢 {{text: title; required}}</b></p><p>Hello team,</p><p>{{textarea: body; required}}</p><p><b>When:</b> {{datetime: when; default=+1d}}<br><b>Where:</b> {{text: where; default=Main conference room}}</p><p>Thanks,<br>{{me.name}}</p>`,
  },
  {
    id: 'lib-college-notice', name: 'Circular / notice', category: 'College administration', shortcut: '/notice', contentType: 'text',
    description: 'Official circular for students or staff.',
    content: `NOTICE
Ref: {{text: ref; label=Reference no.}}      Date: {{today; format=DD/MM/YYYY}}

To: {{select: audience; options=All students,All staff,Faculty members,Parents}}
Subject: {{text: subject; required}}

{{textarea: details; required; rows=5}}

{{me.name}}
{{me.title}}, {{me.company}}`,
  },
  {
    id: 'lib-college-fee', name: 'Fee due reminder', category: 'College administration', shortcut: '/fee', contentType: 'text',
    description: 'Fee reminder with late fine calculation.',
    content: `Dear Parent/Guardian of {{student}},

This is to remind you that the {{select: term; options=Term 1,Term 2,Annual}} fee of {{currency: fee; required}} is due on {{date: due; default=+10d}}.
{{number: fine_per_day; label=Late fine per day; default=50; hidden}}A late fine of {{= fine_per_day; format=currency}} per day applies after the due date.

Kindly ignore if already paid.
Accounts Office, {{me.company}}`,
  },
  {
    id: 'lib-admission-ack', name: 'Admission enquiry reply', category: 'Admissions', shortcut: '/enquiry', contentType: 'text',
    description: 'Respond to admission enquiries with program details.',
    content: `Dear {{applicant}},

Thank you for your interest in the {{select: program; options=B.Sc.,B.Com.,B.A.,BBA,BCA,M.Sc.,MBA; required}} program at {{me.company}}.

Applications for the {{text: session; default=2025-26}} session close on {{date: deadline; default=+30d}}. Documents required:
{{repeat: docs; label=Document; min=1}}  {{index}}. {{text: doc; default=Mark sheets}}
{{endrepeat}}
For any questions, call us at {{me.phone}}.

Admissions Office`,
  },
  {
    id: 'lib-admission-offer', name: 'Admission offer', category: 'Admissions', shortcut: '/offer', contentType: 'text',
    description: 'Offer letter with scholarship handling.',
    content: `Dear {{applicant}},

Congratulations! We are pleased to offer you admission to {{program}} for the {{session}} session.
{{section: scholarship; label=Scholarship awarded?}}You have also been awarded a scholarship of {{number: pct; label=Scholarship %; min=1; max=100}}%, reducing your tuition from {{currency: tuition}} to {{= discount(tuition, pct); format=currency}}.
{{endsection}}
Please confirm your acceptance by {{date: confirm_by; default=+14d}}.

Warm regards,
{{me.name}}, Admissions`,
  },
  {
    id: 'lib-attendance-absent', name: 'Absence notification', category: 'Attendance', shortcut: '/absent', contentType: 'text',
    description: 'Notify a parent about absence.',
    content: `Dear Parent, this is to inform you that {{student}} of class {{text: class}} was absent on {{date: on; default=today; format=dddd, D MMM}}{{text: periods; label=Periods missed (optional); hidden}}{{if: periods}} for {{periods}}{{endif}}. Kindly share the reason with the class teacher. — {{me.company}}`,
  },
  {
    id: 'lib-attendance-low', name: 'Low attendance warning', category: 'Attendance', shortcut: '/lowatt', contentType: 'text',
    description: 'Attendance percentage with shortfall calculation.',
    content: `Dear {{student}},

Your attendance is {{= percent(attended, total); format=number:1}}% ({{number: attended; required}} of {{number: total; label=Total classes; required; min=1}} classes).
{{number: required_pct; label=Required %; default=75; hidden}}{{if: percent(attended, total) < required_pct}}This is below the required {{required_pct}}%. You must attend the next {{= max(0, ceil((required_pct * total - 100 * attended) / (100 - required_pct)))}} classes without absence to reach the minimum.{{else}}You meet the required {{required_pct}}%. Keep it up!{{endif}}

{{me.name}}`,
  },
  {
    id: 'lib-trade-update', name: 'Trading update', category: 'Trading', shortcut: '/trade', contentType: 'text',
    description: 'Trade idea with risk/reward computed automatically.',
    content: `📈 {{select: side; options=BUY,SELL}} {{text: symbol; required; label=Symbol}}
Entry: {{number: entry; required}}
Stop loss: {{number: sl; label=Stop loss; required}}
Target: {{number: target; required}}
Risk/Reward: 1 : {{= round(abs(target - entry) / abs(entry - sl), 2)}}
{{textarea: notes; label=Notes (optional)}}
— {{now; format=DD MMM, HH:mm}}`,
  },
  {
    id: 'lib-trade-recap', name: 'Daily trade recap', category: 'Trading', shortcut: '/recap', contentType: 'text',
    description: 'P&L table and win-rate for the day.',
    content: `Trade recap — {{today; format=dddd, DD MMM YYYY}}

{{repeat: trades; label=Trade}}{{text: symbol; hidden}}{{number: pnl; label=P&L; hidden}}{{endrepeat}}{{table: trades; columns=#:index|Symbol:symbol|P&L:pnl; formats=||currency; total=P&L}}

Trades: {{= count(trades.symbol)}} | Winners: {{= countif(trades.pnl, ">", 0)}} | Win rate: {{= percent(countif(trades.pnl, ">", 0), count(trades.symbol)); format=number:0}}% | Net: {{= sum(trades.pnl); format=currency}}
Lesson of the day: {{textarea: lesson}}`,
  },
  {
    id: 'lib-social-launch', name: 'Product launch post', category: 'Social media', shortcut: '/launch', contentType: 'text',
    description: 'Launch announcement with hashtags.',
    content: `🚀 Big news! {{text: product; required}} is {{select: status; options=now live,coming soon,back in stock}}!

{{textarea: pitch; label=One-line pitch; required; maxlength=200}}

👉 {{text: url; label=Link; pattern=url}}
{{= join(split(hashtags, ","), " ")}}{{text: hashtags; default=#launch,#newproduct; hidden}}`,
  },
  {
    id: 'lib-social-event', name: 'Event countdown post', category: 'Social media', shortcut: '/event', contentType: 'text',
    description: 'Countdown that computes days remaining.',
    content: `⏳ Only {{= datediff(today(), date_of_event)}} days to go until {{text: event; required}}! Join us on {{date: date_of_event; label=Event date; default=+10d; format=dddd, D MMMM}}. {{text: cta; default=Register now!}}`,
  },
  {
    id: 'lib-meeting-notes', name: 'Meeting notes', category: 'Meetings', shortcut: '/notes', contentType: 'text',
    description: 'Structured notes with attendees and action items.',
    content: `Meeting notes — {{text: topic; required}}
Date: {{today; format=DD MMM YYYY}}   Attendees: {{text: attendees}}

Discussion:
{{textarea: discussion; rows=4}}

Action items:
{{repeat: actions; label=Action item}}☐ {{text: task}} — owner: {{text: owner}}, due {{date: due; default=+7d; format=D MMM}}
{{endrepeat}}
Next meeting: {{date: next; default=+7d; format=dddd D MMM}}`,
  },
  {
    id: 'lib-meeting-invite', name: 'Meeting request', category: 'Meetings', shortcut: '/meet', contentType: 'text',
    description: 'Request a meeting with time-slot options.',
    content: `Hi {{name}},

Would you be available for a {{select: length; options=15-minute,30-minute,45-minute,1-hour; default=30-minute}} {{select: medium; options=call,video meeting,in-person meeting}} to discuss {{text: topic; required}}? Any of these times work for me:
{{repeat: slots; label=Time slot; min=2}}• {{datetime: slot; default=+1d}}
{{endrepeat}}
Thanks,
{{me.name}}`,
  },
  {
    id: 'lib-followup-gentle', name: 'Gentle follow-up', category: 'Follow-up', shortcut: '/fup', contentType: 'text',
    description: 'Follow-up that adapts to how long ago you wrote.',
    content: `Hi {{name}},

{{date: sent; label=When did you last write?; default=-7d; hidden}}{{if: datediff(sent, today()) > 14}}It's been a while since my message on {{= formatdate(sent, "D MMMM")}}, so I wanted to check back in{{else}}Just following up on my previous email{{endif}} about {{text: topic; required}}. Please let me know if you need anything else from my side.

Best,
{{me.name}}`,
  },
  {
    id: 'lib-followup-sales', name: 'Post-demo follow-up', category: 'Follow-up', shortcut: '/demo', contentType: 'text',
    description: 'Sales follow-up after a product demo.',
    content: `Hi {{name}},

Thanks again for joining the demo of {{text: product; default=our platform}} {{select: when; options=today,yesterday,last week}}. As promised, here's a quick summary:
{{repeat: points; label=Key point}}  ✔ {{text: point}}
{{endrepeat}}
Would {{date: next; default=+3bd; format=dddd}} work for a quick call to discuss next steps?

{{me.name}} | {{me.phone}}`,
  },
  {
    id: 'lib-proposal', name: 'Business proposal summary', category: 'Sales & proposals', shortcut: '/proposal', contentType: 'html',
    description: 'Rich proposal with pricing table.',
    content: `<h3>Proposal for {{text: client; required}}</h3><p>Prepared by {{me.name}}, {{me.company}} — {{today}}</p><p><b>Objective:</b> {{textarea: objective; required}}</p><p><b>Scope &amp; pricing</b></p>{{repeat: items; label=Deliverable}}{{text: deliverable; hidden}}{{currency: price; hidden}}{{endrepeat}}{{table: items; columns=Deliverable:deliverable|Price:price; formats=|currency; total=Price}}<p><b>Timeline:</b> {{number: weeks; default=4}} weeks (estimated completion {{= formatdate(addweeks(today(), weeks), "D MMMM YYYY")}}).</p><p>This proposal is valid until {{date: valid; default=+30d}}.</p>`,
  },
  {
    id: 'lib-quote', name: 'Price quote', category: 'Sales & proposals', shortcut: '/quote', contentType: 'text',
    description: 'Quote with volume discount rule.',
    content: `Hi {{name}}, thank you for your enquiry. For {{number: units; required; min=1}} units of {{text: product; required}} at {{currency: unit_price; required}} each:
{{set: gross = units * unit_price}}{{set: pct = if(units >= 100, 15, if(units >= 50, 10, if(units >= 10, 5, 0)))}}
Subtotal: {{= gross; format=currency}}
{{if: pct > 0}}Volume discount ({{= pct}}%): -{{= percentof(pct, gross); format=currency}}
{{endif}}Total: {{= discount(gross, pct); format=currency}}
This quote is valid for {{number: valid_days; default=15; hidden}}{{valid_days}} days (until {{= formatdate(adddays(today(), valid_days), "D MMM YYYY")}}).`,
  },
  {
    id: 'lib-personal-birthday', name: 'Birthday wishes', category: 'Personal', shortcut: '/bday', contentType: 'text',
    description: 'Warm birthday message.',
    content: `Happy birthday, {{name}}! 🎉{{number: age; label=Age (optional); hidden}}{{if: age}} {{age}} looks great on you!{{endif}} Wishing you a year full of joy, health and success. {{select: closing; options=Have an amazing day!,Enjoy your special day!,Cheers to you!}}`,
  },
  {
    id: 'lib-personal-running-late', name: 'Running late', category: 'Personal', shortcut: '/late', contentType: 'text',
    description: 'Tells someone your new arrival time.',
    content: `Sorry, I'm running about {{number: mins; label=Minutes late; default=15}} minutes late — I should be there around {{= formatdate(addminutes(now(), mins), "h:mm A")}}.`,
  },
  {
    id: 'lib-personal-address', name: 'My contact card', category: 'Personal', shortcut: '/contact', contentType: 'text',
    description: 'Share your contact details.',
    content: `{{me.name}}
{{me.title}}, {{me.company}}
📞 {{me.phone}}  ✉ {{me.email}}
{{me.website}}`,
  },
  {
    id: 'lib-datahub-customer', name: 'Customer details from Data Hub', category: 'Customer support', shortcut: '/cust', contentType: 'text',
    description: 'Pick a customer from the Data Hub "customers" table.',
    content: `Hi {{pick: customer; table=customers; display=name}},

We have the following details on file:
Email: {{customer.email}}
Phone: {{customer.phone}}
Plan: {{customer.plan}}

Please reply if anything needs to be updated.
{{me.name}}`,
  },
];

export const LIBRARY: LibraryTemplate[] = [...LIBRARY_BASE, ...LIBRARY_PRO];
