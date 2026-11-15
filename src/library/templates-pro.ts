// Extended library: trading (gold / forex) analysis, signals and trade management,
// running a paid VIP channel, payments/business and education administration.
// WhatsApp/Telegram formatting is used where relevant: *bold*, _italic_.
// Pip factor convention: pips per 1.00 price move — XAUUSD 10, EURUSD 10000, USDJPY 100.
import type { LibraryTemplate } from './templates';

const NFA = '⚠️ _Not financial advice. Trade at your own risk and always use a stop loss._';
const PIP = '{{number: pip_factor; label=Pips per 1.00 move (Gold 10 · EURUSD 10000 · JPY pairs 100); default=10; hidden}}';

export const LIBRARY_PRO: LibraryTemplate[] = [
  // ───────────────────────── Market analysis
  {
    id: 'lib-xau-weekly', name: 'Gold weekly outlook (high timeframe)', category: 'Market analysis', shortcut: '/xauw', contentType: 'text',
    description: 'Weekly HTF post: context, key level, bearish & bullish scenarios with targets.',
    content: `🟡 *{{text: symbol; default=XAUUSD}} Weekly Outlook*
*High Timeframe Analysis*
━━━━━━━━━━━━━━━

*📊 Context*
{{textarea: context; label=Last week recap; required; rows=4; placeholder=Gold saw strong selling pressure last week…}}

*🔑 Key level: {{number: key_level; label=Key level; required; format=number}}*
{{textarea: key_note; label=Why this level matters; default=This is the level that decides the next leg. Everything depends on how the daily and weekly candles close around it.}}
━━━━━━━━━━━━━━━

*🔻 Scenario 1 — Breakdown*
• Bearish daily candle close below *{{key_level}}*
• Look for sell setups after the close is confirmed
• Target zone: *{{text: bear_targets; label=Bearish target zone; required; placeholder=3,600 – 3,350}}*

*🔺 Scenario 2 — Hold & bounce*
• Rejection / daily close back above *{{key_level}}*
• Look for buy setups on lower-timeframe confirmation
• Target zone: *{{text: bull_targets; label=Bullish target zone; required; placeholder=3,950 – 4,050}}*
{{section: extra; label=Add extra notes?}}
*📝 Notes*
{{textarea: notes}}
{{endsection}}
━━━━━━━━━━━━━━━
📅 Week of {{today; format=D MMM YYYY}}{{section: credit; label=Add credit line?}}
Credits: {{text: credit_name; label=Credit to}}{{endsection}}

${NFA}`,
  },
  {
    id: 'lib-xau-daily', name: 'Gold daily trading plan', category: 'Market analysis', shortcut: '/xaud', contentType: 'text',
    description: 'Intraday plan with bias, Asian range, levels and session notes.',
    content: `🟡 *{{text: symbol; default=XAUUSD}} Daily Plan — {{today; format=ddd, D MMM}}*

*Bias:* {{select: bias; options=🔺 Bullish,🔻 Bearish,➖ Neutral / range; required}}
*Asian range:* {{number: asia_low; label=Asian low; format=number}} – {{number: asia_high; label=Asian high; format=number}}  ({{= round(abs(asia_high - asia_low) * pip_factor)}} pips)

*Resistance:* {{text: resistance; required; placeholder=3,860 / 3,885}}
*Support:* {{text: support; required; placeholder=3,810 / 3,790}}

*Plan*
{{textarea: plan; required; rows=3; placeholder=Wait for London to sweep the Asian high, then look for sells back into the range…}}
{{checkbox: news_day; label=High-impact news today?; hidden}}{{if: news_day}}
📰 *News:* {{text: news_event; label=News event & time}} — avoid entries 15 min before/after.
{{endif}}
${PIP}${NFA}`,
  },
  {
    id: 'lib-levels', name: 'Key levels update', category: 'Market analysis', shortcut: '/levels', contentType: 'text',
    description: 'Quick support/resistance list with current price.',
    content: `📍 *{{text: symbol; default=XAUUSD}} key levels* — {{now; format=D MMM, HH:mm}}

Current price: *{{number: price; required; format=number}}*

🔴 Resistance
{{repeat: res; label=Resistance; min=1}}  R{{index}}: {{number: level; format=number}}
{{endrepeat}}
🟢 Support
{{repeat: sup; label=Support; min=1}}  S{{index}}: {{number: level; format=number}}
{{endrepeat}}
{{textarea: comment; label=Comment (optional)}}`,
  },
  {
    id: 'lib-news-alert', name: 'High-impact news alert', category: 'Market analysis', shortcut: '/news', contentType: 'text',
    description: 'NFP / CPI / FOMC warning with time and forecast.',
    content: `📰 *NEWS ALERT — {{select: event; options=NFP (Non-Farm Payrolls),CPI (Inflation),FOMC Rate Decision,Fed Chair Speech,GDP,Unemployment Claims,PPI,Retail Sales; required}}*

🕒 Time: *{{time: at; label=Release time; required}}* ({{date: on; default=today; format=ddd D MMM}})
Forecast: {{text: forecast; placeholder=e.g. 180K}} | Previous: {{text: previous; placeholder=e.g. 150K}}

Expect high volatility on {{text: pairs; label=Affected pairs; default=XAUUSD and USD pairs}}.
✅ Close or protect open trades
✅ No new entries 15 minutes before and after
✅ Wait for the first candle to close before reacting

Stay safe, traders 🙏`,
  },
  {
    id: 'lib-gm-traders', name: 'Good morning / market open', category: 'Market analysis', shortcut: '/gm', contentType: 'text',
    description: 'Daily greeting with day name and focus for the session.',
    content: `{{= greeting()}} traders ☀️

Happy {{= weekday(today())}}! {{select: focus; options=Patience is a position — wait for your setup.,Protect your capital first — profits follow.,Plan the trade and trade the plan.,No setup = no trade. Stay disciplined.}}

Today we're watching *{{text: symbol; default=XAUUSD}}*{{text: watch_note; label=What are you watching? (optional); hidden}}{{if: watch_note}} — {{watch_note}}{{endif}}.
Analysis coming before the {{select: session; options=London,New York,Asian}} session. 📊`,
  },
  {
    id: 'lib-session', name: 'Session update', category: 'Market analysis', shortcut: '/session', contentType: 'text',
    description: 'London / New York session recap with price move.',
    content: `⏱ *{{select: session; options=London,New York,Asian}} session update — {{text: symbol; default=XAUUSD}}*

Open: {{number: open; required; format=number}} → Now: {{number: now_price; label=Current price; required; format=number}}
Move: *{{= now_price - open > 0 ? "+" : ""}}{{= round((now_price - open) * pip_factor)}} pips* {{= now_price >= open ? "🟢" : "🔴"}}

{{textarea: summary; label=What happened; required}}
${PIP}`,
  },

  // ───────────────────────── Trade signals
  {
    id: 'lib-signal', name: 'Trade signal (entry, SL, TPs, R:R)', category: 'Trade signals', shortcut: '/entry', contentType: 'text',
    description: 'Full signal with pips risk and risk/reward calculated; validates SL side.',
    content: `🚨 *{{select: side; options=BUY,SELL; required}} {{text: symbol; default=XAUUSD}}* {{select: kind; label=Order type; options=NOW,LIMIT,STOP; default=NOW}}

📍 Entry: *{{number: entry; required; format=number}}*
🛑 SL: *{{number: sl; label=Stop loss; required; format=number}}*  ({{= round(abs(entry - sl) * pip_factor)}} pips)
🎯 TP1: *{{number: tp1; required; format=number}}*  (+{{= round(abs(tp1 - entry) * pip_factor)}} pips · R:R 1:{{= round(abs(tp1 - entry) / abs(entry - sl), 1)}})
{{number: tp2; label=TP2 (optional); format=number; hidden}}{{if: tp2}}🎯 TP2: *{{tp2}}*  (+{{= round(abs(tp2 - entry) * pip_factor)}} pips)
{{endif}}{{number: tp3; label=TP3 (optional); format=number; hidden}}{{if: tp3}}🎯 TP3: *{{tp3}}*  (+{{= round(abs(tp3 - entry) * pip_factor)}} pips)
{{endif}}
Risk: {{select: risk; label=Suggested risk; options=1%,0.5%,2%; default=1%}} per trade · Move SL to entry after TP1 ✅
{{validate: if(side = "BUY", sl < entry, sl > entry); message=Stop loss must be below entry for BUY and above entry for SELL}}${PIP}
${NFA}`,
  },
  {
    id: 'lib-pending', name: 'Pending order placed', category: 'Trade signals', shortcut: '/pending', contentType: 'text',
    description: 'Limit / stop order alert with expiry.',
    content: `⏳ *PENDING ORDER — {{select: side; options=BUY LIMIT,SELL LIMIT,BUY STOP,SELL STOP}} {{text: symbol; default=XAUUSD}}*

Entry: *{{number: entry; required; format=number}}*
SL: {{number: sl; required; format=number}} · TP: {{number: tp; required; format=number}}
R:R 1:{{= round(abs(tp - entry) / abs(entry - sl), 1)}}

Cancel if not triggered by *{{select: expiry; options=end of today,London close,New York close,end of week}}*.`,
  },
  {
    id: 'lib-signal-short', name: 'Quick signal (one line)', category: 'Trade signals', shortcut: '/qs', contentType: 'text',
    description: 'Compact signal for fast-moving markets.',
    content: `{{select: side; options=🟢 BUY,🔴 SELL}} *{{text: symbol; default=XAUUSD}}* @ {{number: entry; required; format=number}} | SL {{number: sl; required; format=number}} | TP {{number: tp; required; format=number}} | R:R 1:{{= round(abs(tp - entry) / abs(entry - sl), 1)}}`,
  },

  // ───────────────────────── Trade management
  {
    id: 'lib-tp-hit', name: 'TP hit 🎯', category: 'Trade management', shortcut: '/tphit', contentType: 'text',
    description: 'Celebrate a target hit with pips and next instruction.',
    content: `🎯 *{{select: which; options=TP1,TP2,TP3,FINAL TP}} HIT — {{text: symbol; default=XAUUSD}} {{select: side; options=BUY,SELL}}* ✅

+{{= round(abs(exit - entry) * pip_factor)}} pips secured 💰 (entry {{number: entry; required; format=number}} → {{number: exit; label=Target price; required; format=number}})

{{select: next; label=Next instruction; options=Move SL to entry (risk-free) and let the rest run 🚀,Close 50% and trail the stop,Trade fully closed — congratulations!}}
${PIP}`,
  },
  {
    id: 'lib-sl-hit', name: 'Stop loss hit', category: 'Trade management', shortcut: '/slhit', contentType: 'text',
    description: 'Professional loss update keeping the group calm.',
    content: `🛑 *SL hit — {{text: symbol; default=XAUUSD}} {{select: side; options=BUY,SELL}}*

−{{= round(abs(entry - sl) * pip_factor)}} pips (entry {{number: entry; required; format=number}}, SL {{number: sl; required; format=number}}).

Losses are part of trading — the stop did its job and protected our capital. 🙏
{{select: next; options=We wait for the next clean setup.,Re-entry plan will be shared if conditions are met.,No more trades today — protecting the week.}}
${PIP}`,
  },
  {
    id: 'lib-breakeven', name: 'Move SL to breakeven', category: 'Trade management', shortcut: '/beven', contentType: 'text',
    description: 'Instruction to secure a trade at entry.',
    content: `🔒 *{{text: symbol; default=XAUUSD}} update* — price moved +{{= round(abs(price - entry) * pip_factor)}} pips in our favour.

Move SL to *entry ({{number: entry; required; format=number}})* now. Trade is risk-free ✅
Current price: {{number: price; required; format=number}}
${PIP}`,
  },
  {
    id: 'lib-partial', name: 'Partial close', category: 'Trade management', shortcut: '/partial', contentType: 'text',
    description: 'Book partial profits and trail the rest.',
    content: `💰 *Partial close — {{text: symbol; default=XAUUSD}}*

Close *{{select: pct; options=50%,30%,70%,25%}}* at {{number: price; required; format=number}} (+{{= round(abs(price - entry) * pip_factor)}} pips from entry {{number: entry; required; format=number}}).
Trail the remaining position with SL at {{number: new_sl; label=New stop loss; required; format=number}}.
${PIP}`,
  },
  {
    id: 'lib-running', name: 'Trade running in profit', category: 'Trade management', shortcut: '/running', contentType: 'text',
    description: 'Live update of an open trade.',
    content: `📈 *{{text: symbol; default=XAUUSD}} {{select: side; options=BUY,SELL}}* running +{{= round(abs(price - entry) * pip_factor)}} pips 🔥

Entry {{number: entry; required; format=number}} → now {{number: price; required; format=number}}
{{select: tip; options=Hold — targets still valid.,Consider securing partials here.,SL already at breakeven — let it run.}}
${PIP}`,
  },
  {
    id: 'lib-trade-closed', name: 'Trade closed — result', category: 'Trade management', shortcut: '/tclose', contentType: 'text',
    description: 'Final result with pips and money for a chosen lot size.',
    content: `✅ *Trade closed — {{text: symbol; default=XAUUSD}} {{select: side; options=BUY,SELL}}*

Entry {{number: entry; required; format=number}} → Exit {{number: exit; required; format=number}}
{{set: pips = round((exit - entry) * pip_factor * if(side = "BUY", 1, -1))}}Result: *{{= pips > 0 ? "+" : ""}}{{= pips}} pips* {{= pips > 0 ? "🟢" : pips < 0 ? "🔴" : "⚪"}}
{{number: lots; label=Lot size (optional, for $ result); hidden}}{{number: pip_value; label=Pip value per lot ($); default=10; hidden}}{{if: lots}}≈ {{= pips * pip_value * lots; format=currency}} on {{lots}} lot(s)
{{endif}}
{{textarea: note; label=Comment (optional)}}
${PIP}`,
  },
  {
    id: 'lib-cancel', name: 'Signal cancelled', category: 'Trade management', shortcut: '/cancel', contentType: 'text',
    description: 'Cancel a pending order / idea with reason.',
    content: `❌ *Cancel {{text: symbol; default=XAUUSD}} {{select: what; options=pending order,signal,re-entry idea}}*

Reason: {{select: reason; options=Price moved too far before entry,Setup invalidated on the close,High-impact news ahead,Market conditions changed}}.
We wait for a better opportunity. 🙏`,
  },

  // ───────────────────────── Risk & journal
  {
    id: 'lib-lots', name: 'Position size calculator', category: 'Risk & journal', shortcut: '/lots', contentType: 'text',
    description: 'Lot size from balance, risk % and stop loss in pips.',
    content: `🧮 *Position size*

Balance: {{currency: balance; required; min=1}}
Risk: {{number: risk_pct; label=Risk %; default=1; min=0.1; max=10; step=0.1}}% = *{{= percentof(risk_pct, balance); format=currency}}*
Stop loss: {{number: sl_pips; label=Stop loss (pips); required; min=1}} pips
Pip value per 1.00 lot: {{number: pip_value; label=Pip value per lot ($) — Gold 10 (0.1 pip) · majors 10; default=10; min=0.01}} $

👉 Lot size: *{{= floor(percentof(risk_pct, balance) / (sl_pips * pip_value) * 100) / 100}} lots*`,
  },
  {
    id: 'lib-weekly-perf', name: 'Weekly performance report', category: 'Risk & journal', shortcut: '/wkperf', contentType: 'text',
    description: 'Table of the week’s trades with total pips and win rate.',
    content: `📊 *Weekly results — {{= formatdate(addbusinessdays(today(), -4), "D MMM")}} to {{today; format=D MMM YYYY}}*

{{repeat: trades; label=Trade; min=1}}{{text: symbol; default=XAUUSD; hidden}}{{select: side; options=BUY,SELL; hidden}}{{number: pips; label=Result (pips, negative for loss); hidden}}{{endrepeat}}{{table: trades; columns=#:index|Pair:symbol|Side:side|Pips:pips; total=Pips}}

✅ Wins: {{= countif(trades.pips, ">", 0)}} · ❌ Losses: {{= countif(trades.pips, "<", 0)}} · ⚪ BE: {{= countif(trades.pips, "=", 0)}}
🎯 Win rate: *{{= round(percent(countif(trades.pips, ">", 0), count(trades.pips)))}}%*
💰 Net: *{{= sum(trades.pips) > 0 ? "+" : ""}}{{= sum(trades.pips)}} pips*

Thank you for trading with us 🙏`,
  },
  {
    id: 'lib-monthly-report', name: 'Monthly performance summary', category: 'Risk & journal', shortcut: '/mreport', contentType: 'text',
    description: 'Month totals, win rate, best week and growth %.',
    content: `🏆 *{{today; format=MMMM YYYY}} performance*

Total signals: {{number: total; required; min=1}}
Wins: {{number: wins; required; min=0}} · Losses: {{= total - wins}}
Win rate: *{{= round(percent(wins, total))}}%*
Net pips: *{{number: net_pips; label=Net pips; required}}*
{{number: growth; label=Account growth % (optional); hidden}}{{if: growth}}Account growth: *{{growth}}%* 📈
{{endif}}Best trade: {{text: best; label=Best trade; placeholder=XAUUSD sell +420 pips}}

Grateful for this community — next month, same discipline. 💪
${NFA}`,
  },
  {
    id: 'lib-journal', name: 'Trade journal entry', category: 'Risk & journal', shortcut: '/journal', contentType: 'text',
    description: 'Personal journal: setup, execution, emotions, lesson.',
    content: `📓 Journal — {{now; format=ddd D MMM YYYY, HH:mm}}
Pair: {{text: symbol; default=XAUUSD}} | {{select: side; options=BUY,SELL}} | Result: {{number: pips; label=Result (pips)}} pips
Setup: {{select: setup; options=Break & retest,Liquidity sweep,Supply/demand zone,Trendline bounce,Breakout,Other}}
Followed plan? {{select: plan; options=Yes,Partly,No}}
Emotion: {{select: emotion; options=Calm,Confident,Anxious,FOMO,Revenge,Bored}}
What went well: {{textarea: good; rows=2}}
Mistake: {{textarea: mistake; rows=2}}
Lesson: {{text: lesson; required}}
Screenshot: {{text: chart; label=Chart link (optional)}}`,
  },
  {
    id: 'lib-disclaimer', name: 'Risk disclaimer', category: 'Risk & journal', shortcut: '/nfa', contentType: 'text',
    description: 'Standard trading disclaimer.',
    content: `⚠️ *Disclaimer*
All content shared here is for educational purposes only and is not financial advice. Trading forex, gold and CFDs carries a high level of risk and may not be suitable for everyone. Never risk money you cannot afford to lose. Past performance does not guarantee future results.`,
  },
  {
    id: 'lib-tip', name: 'Trading tip of the day', category: 'Risk & journal', shortcut: '/tip', contentType: 'text',
    description: 'Educational post for your channel.',
    content: `💡 *Trading tip #{{number: n; label=Tip number; default=1}}* — {{text: title; required; placeholder=Wait for the candle close}}

{{textarea: body; required; rows=4}}

{{select: cta; options=Save this for later 📌,Share with a trader friend 🤝,Questions? Reply below 👇}}`,
  },

  // ───────────────────────── VIP channel
  {
    id: 'lib-vip-welcome', name: 'Welcome new VIP member', category: 'VIP channel', shortcut: '/welcome', contentType: 'text',
    description: 'Onboarding message with plan and automatic expiry date.',
    content: `🎉 Welcome to *{{text: group; label=Group name; default=Gold VIP}}*, {{text: name; required}}!

✅ Plan: *{{select: plan; options=1 Month,3 Months,6 Months,12 Months; default=1 Month}}*
📅 Valid until: *{{= formatdate(addmonths(today(), number(left(plan, 2))), "D MMMM YYYY")}}*

What you get:
• Daily gold analysis & signals with entry, SL and TPs
• Live trade management updates
• Weekly & monthly performance reports

📌 Please read the pinned rules and set notifications to *All*.
Let's grow together 💪`,
  },
  {
    id: 'lib-vip-pay', name: 'VIP subscription — payment details', category: 'VIP channel', shortcut: '/vippay', contentType: 'text',
    description: 'Price, discount and payment instructions.',
    content: `💎 *{{text: group; label=Group name; default=Gold VIP}} — Subscription*

Plan: *{{select: plan; options=1 Month,3 Months,6 Months,12 Months}}*
Price: {{currency: price; required; min=0}}{{number: disc; label=Discount % (optional); default=0; min=0; max=90; hidden}}{{if: disc > 0}} → *{{= discount(price, disc); format=currency}}* ({{disc}}% off 🔥){{endif}}

*How to pay*
{{textarea: methods; label=Payment details (UPI / bank / USDT); required; rows=3; placeholder=UPI: yourname@bank\nUSDT (TRC20): …}}

After paying, send the screenshot here and you'll be added within {{select: eta; options=30 minutes,1 hour,a few hours}}. ✅`,
  },
  {
    id: 'lib-vip-renew', name: 'Subscription renewal reminder', category: 'VIP channel', shortcut: '/renew', contentType: 'text',
    description: 'Days-left countdown computed from the expiry date.',
    content: `⏰ Hi {{name}}, your *{{text: group; label=Group name; default=Gold VIP}}* membership {{date: expiry; label=Expiry date; default=+3d; hidden}}{{if: datediff(today(), expiry) > 0}}expires in *{{= datediff(today(), expiry)}} day(s)* — on {{= formatdate(expiry, "dddd, D MMM")}}{{elseif: datediff(today(), expiry) = 0}}expires *today*{{else}}expired on {{= formatdate(expiry, "D MMM")}}{{endif}}.

Renew now to keep receiving signals without interruption:
Renewal price: {{currency: price; required}}
{{text: pay; label=Payment details; default=Same UPI / bank as before}}

Thank you for being part of the community 🙏`,
  },
  {
    id: 'lib-vip-expired', name: 'Membership expired', category: 'VIP channel', shortcut: '/expired', contentType: 'text',
    description: 'Polite removal notice with re-join offer.',
    content: `Hi {{name}}, your VIP membership ended on {{date: ended; default=today; format=D MMM YYYY}}, so access has been paused.

Rejoin any time — {{select: offer; options=renew within 48 hours and get 10% off 🎁,the same price applies,reply here and I'll share the payment details}}.
Hope to see you back soon! 🙏`,
  },
  {
    id: 'lib-vip-access', name: 'Payment received — access granted', category: 'VIP channel', shortcut: '/access', contentType: 'text',
    description: 'Confirms payment and shares the joining link.',
    content: `✅ Payment of {{currency: amount; required}} received — thank you, {{name}}!

Your *{{select: plan; options=1 Month,3 Months,6 Months,12 Months}}* access is active until *{{= formatdate(addmonths(today(), number(left(plan, 2))), "D MMM YYYY")}}*.
Join here: {{text: link; label=Group invite link; required; pattern=url}}

Please don't share the link — it's personal. Welcome aboard 🚀`,
  },
  {
    id: 'lib-vip-promo', name: 'Promo / offer announcement', category: 'VIP channel', shortcut: '/promo', contentType: 'text',
    description: 'Limited-time offer with discounted price and deadline.',
    content: `🔥 *{{text: title; label=Offer name; default=Limited-time VIP offer}}* 🔥

{{select: plan; options=1 Month,3 Months,6 Months,12 Months}} VIP access: ~{{currency: price; required}}~ → *{{= discount(price, disc); format=currency}}*
That's *{{number: disc; label=Discount %; required; min=1; max=90}}% OFF* 🎁

⏳ Offer ends *{{date: ends; default=+3d; format=dddd, D MMM}}* — only {{number: seats; label=Seats available; default=20}} seats.
DM "{{text: keyword; default=VIP}}" to grab it 👇`,
  },
  {
    id: 'lib-vip-rules', name: 'Group rules', category: 'VIP channel', shortcut: '/rules', contentType: 'text',
    description: 'Pinned rules for a signals group.',
    content: `📌 *{{text: group; label=Group name; default=Gold VIP}} — Rules*

1️⃣ Always use a stop loss and risk max {{number: max_risk; label=Max risk %; default=2}}% per trade.
2️⃣ Signals are posted with entry, SL and TP — don't enter late if price has moved more than {{number: late_pips; label=Late-entry limit (pips); default=30}} pips.
3️⃣ Follow trade-management updates (BE, partials, closes).
4️⃣ No spam, links or promotions.
5️⃣ Respect all members — no rude language.
6️⃣ Membership is personal — sharing content leads to removal without refund.

Questions? Contact {{text: admin; label=Admin contact; default=@admin}}. Happy trading 📈`,
  },
  {
    id: 'lib-vip-howjoin', name: '“How do I join?” reply', category: 'VIP channel', shortcut: '/howjoin', contentType: 'text',
    description: 'Answer to people asking how to join.',
    content: `Hi {{name}} 👋 Thanks for your interest!

Here's how to join *{{text: group; label=Group name; default=Gold VIP}}*:
1. Choose a plan — {{text: plans; label=Plans & prices; default=1 month / 3 months / 12 months}}
2. Pay via {{text: methods; label=Payment methods; default=UPI, bank transfer or USDT}}
3. Send the payment screenshot here
4. Get your personal invite link ✅

{{checkbox: free; label=Mention free channel; default=yes; hidden}}{{if: free}}Want to see our work first? Free channel: {{text: free_link; label=Free channel link}}
{{endif}}Any questions, just ask 🙂`,
  },
  {
    id: 'lib-broker', name: 'Broker account opening steps', category: 'VIP channel', shortcut: '/broker', contentType: 'text',
    description: 'Referral / account opening instructions.',
    content: `🏦 *Open your trading account with {{text: broker; required}}*

1. Register here: {{text: link; label=Referral link; required; pattern=url}}
2. Complete verification (ID + address proof)
3. Choose account type: *{{select: acct; options=Standard,Raw/ECN,Cent,Pro}}*
4. Deposit at least {{currency: min_dep; label=Minimum deposit; default=100}}
5. Send me your account ID: {{text: idnote; label=What to send; default=your MT5 login number}}

{{text: bonus; label=Bonus / benefit (optional); hidden}}{{if: bonus}}🎁 Benefit: {{bonus}}
{{endif}}${NFA}`,
  },

  // ───────────────────────── Payments & business
  {
    id: 'lib-emi', name: 'Instalment plan (EMI schedule)', category: 'Payments', shortcut: '/emi', contentType: 'text',
    description: 'Splits a total into monthly instalments with due dates.',
    content: `Dear {{name}},

As discussed, your total of {{currency: total; required; min=1}} will be paid in *{{number: months; label=Number of instalments; default=3; min=1; max=24}} monthly instalments* of {{= total / months; format=currency}}:

{{date: first_due; label=First due date; default=+7d; hidden}}{{repeat: schedule; count=months}}{{index}}. {{= formatdate(addmonths(first_due, index - 1), "D MMM YYYY")}} — {{= total / months; format=currency}}
{{endrepeat}}
Kindly pay on or before each date. Thank you!
{{me.name}}`,
  },
  {
    id: 'lib-bank', name: 'Share payment details', category: 'Payments', shortcut: '/bank', contentType: 'text',
    description: 'Bank / UPI details with amount and reference.',
    content: `Please make the payment of *{{currency: amount; required}}* using:

{{select: method; options=UPI,Bank transfer,USDT (crypto),Card link}}{{if: method = "UPI"}}
UPI ID: *{{text: upi; label=UPI ID; default=yourname@bank}}*{{elseif: method = "Bank transfer"}}
Bank: {{text: bank_name; label=Bank name}}
A/C name: {{text: acct_name; label=Account name}}
A/C no: {{text: acct_no; label=Account number}}
IFSC/SWIFT: {{text: ifsc; label=IFSC / SWIFT}}{{elseif: method = "USDT (crypto)"}}
USDT address ({{select: network; options=TRC20,ERC20,BEP20}}): {{text: wallet; label=Wallet address}}{{else}}
Pay here: {{text: card_link; label=Payment link}}{{endif}}

Reference: *{{text: ref; label=Reference / invoice no.; required}}*
Please share the screenshot once done. Thank you! 🙏`,
  },
  {
    id: 'lib-payment-followup', name: 'Payment follow-up (2nd reminder)', category: 'Payments', shortcut: '/payfup', contentType: 'text',
    description: 'Firmer reminder with days overdue computed.',
    content: `Hi {{name}},

Following up on the payment of *{{currency: amount; required}}* that was due on {{date: due; label=Original due date; default=-5d; format=D MMM YYYY}}{{if: datediff(due, today()) > 0}} — now *{{= datediff(due, today())}} day(s) overdue*{{endif}}.

Please clear it by {{date: final; label=New deadline; default=+2d; format=dddd, D MMM}}{{checkbox: late_fee; label=Mention late fee; hidden}}{{if: late_fee}} to avoid a late fee of {{currency: fee; label=Late fee}}{{endif}}. If already paid, kindly share the receipt.

Thank you,
{{me.name}}`,
  },
  {
    id: 'lib-shortly', name: 'Quick reply: will get back shortly', category: 'Customer support', shortcut: '/shortly', contentType: 'text',
    description: 'Holding reply with ETA.',
    content: `Hi {{name}}, thanks for your message! I'm checking this and will get back to you within {{select: eta; options=15 minutes,1 hour,a few hours,today,24 hours}}. 🙏`,
  },
  {
    id: 'lib-screenshot', name: 'Quick reply: please share a screenshot', category: 'Customer support', shortcut: '/sshot', contentType: 'text',
    description: 'Ask for screenshot / details to resolve an issue.',
    content: `Hi {{name}}, could you please share {{select: what; options=a screenshot of the issue,your payment screenshot,your account ID,the error message}}? That will help me sort this out quickly. Thank you!`,
  },
  {
    id: 'lib-order-status', name: 'Order / request status update', category: 'Customer support', shortcut: '/status', contentType: 'text',
    description: 'Status with stage and expected date.',
    content: `Hi {{name}}, update on your {{select: kind; options=order,request,application,refund}} *#{{text: ref; label=Reference no.; required}}*:

Status: *{{select: status; options=Received ✅,In progress ⏳,Shipped 🚚,Completed 🎉,On hold ⚠️}}*
Expected by: {{date: eta; default=+2bd; format=ddd, D MMM}}
{{text: note; label=Note (optional); hidden}}{{if: note}}Note: {{note}}
{{endif}}
Thanks for your patience!`,
  },

  // ───────────────────────── College / admissions administration
  {
    id: 'lib-fee-receipt', name: 'Fee receipt confirmation', category: 'College administration', shortcut: '/receipt', contentType: 'text',
    description: 'Receipt with balance due computed.',
    content: `🧾 *Fee receipt — {{me.company}}*
Receipt no: {{text: receipt; required}}   Date: {{today; format=DD/MM/YYYY}}

Student: {{student}}   Class/Course: {{text: course; required}}
Amount received: *{{currency: paid; required}}* via {{select: mode; options=Cash,UPI,Bank transfer,Cheque,Card}}
{{currency: total; label=Total fee for the term; hidden}}{{if: total > paid}}Balance due: *{{= total - paid; format=currency}}* by {{date: due; default=+30d; format=D MMM YYYY}}{{else}}Fees fully paid ✅{{endif}}

Thank you.
Accounts Office`,
  },
  {
    id: 'lib-exam-notice', name: 'Exam timetable notice', category: 'College administration', shortcut: '/exam', contentType: 'text',
    description: 'Exam schedule table built from rows.',
    content: `*{{select: exam; options=Mid-term,Final,Unit test,Practical,Internal}} Examination — {{text: course; label=Class / course; required}}*

{{repeat: papers; label=Paper; min=1}}{{date: on; label=Date; default=+7d; hidden}}{{text: subject; hidden}}{{text: timing; label=Time; default=10:00 – 13:00; hidden}}{{endrepeat}}{{table: papers; columns=Date:formatdate(on, "ddd D MMM")|Subject:subject|Time:timing}}

Report 30 minutes early with your ID card and admit card.
{{me.title}}, {{me.company}}`,
  },
  {
    id: 'lib-ptm', name: 'Parent-teacher meeting invitation', category: 'College administration', shortcut: '/ptm', contentType: 'text',
    description: 'PTM invite with date, time and venue.',
    content: `Dear Parent,

You are invited to the Parent-Teacher Meeting for *{{text: class; label=Class; required}}* on *{{date: on; default=+7d; format=dddd, D MMMM}}* from {{time: from; default=10:00}} to {{time: to; default=13:00}} at {{text: venue; default=the school auditorium}}.

{{checkbox: report; label=Report cards will be shared; default=yes; hidden}}{{if: report}}Report cards will be shared during the meeting. {{endif}}Your presence is important.

Regards,
{{me.name}}, {{me.company}}`,
  },
  {
    id: 'lib-holiday', name: 'Holiday notice', category: 'College administration', shortcut: '/holiday', contentType: 'text',
    description: 'Holiday announcement with reopening date.',
    content: `📢 *Holiday Notice*

The {{select: inst; options=college,school,office,institute}} will remain closed from *{{date: from; default=+1d; format=D MMM}}* to *{{date: to; default=+2d; format=D MMM YYYY}}* ({{= datediff(from, to) + 1}} day(s)) on account of {{text: reason; required; placeholder=Diwali}}.
Classes resume on *{{= formatdate(addbusinessdays(to, 1), "dddd, D MMM")}}*.

{{me.company}}`,
  },
  {
    id: 'lib-result', name: 'Result announcement', category: 'College administration', shortcut: '/result', contentType: 'text',
    description: 'Individual result with percentage and grade.',
    content: `Dear {{student}},

Your {{text: exam; default=final examination}} result: *{{number: marks; required; min=0}} / {{number: max_marks; label=Out of; default=500; min=1}}* = *{{= round(percent(marks, max_marks), 1)}}%*
Grade: *{{= choose(true, percent(marks, max_marks) >= 90, "A+", percent(marks, max_marks) >= 75, "A", percent(marks, max_marks) >= 60, "B", percent(marks, max_marks) >= 45, "C", percent(marks, max_marks) >= 33, "D", "Needs improvement")}}*

{{= percent(marks, max_marks) >= 33 ? "Congratulations! 🎉" : "Please meet your class teacher to plan improvement."}}
{{me.company}}`,
  },
  {
    id: 'lib-docs', name: 'Document submission reminder', category: 'Admissions', shortcut: '/docs', contentType: 'text',
    description: 'List of pending documents with deadline.',
    content: `Dear {{applicant}},

To complete your admission for {{text: course; required}}, please submit the following by *{{date: by; default=+5d; format=dddd, D MMM}}*:
{{repeat: docs; label=Document; min=1}}  ☐ {{text: doc; default=Photocopy of Aadhaar}}
{{endrepeat}}
Submit at the admission office ({{text: hours; label=Office hours; default=10 am – 4 pm, Mon–Sat}}) or reply here with scans.

Admissions Office, {{me.company}}`,
  },
  {
    id: 'lib-admit-confirm', name: 'Admission confirmed + fee breakdown', category: 'Admissions', shortcut: '/admit', contentType: 'text',
    description: 'Confirmation with itemised fee table and total.',
    content: `🎓 Dear {{applicant}}, your admission to *{{text: course; required}}* ({{text: session; default=2025-26}}) is confirmed!

Fee details:
{{repeat: fees; label=Fee item; min=1}}{{text: item; default=Tuition fee; hidden}}{{currency: amount; hidden}}{{endrepeat}}{{table: fees; columns=Item:item|Amount:amount; formats=|currency; total=Amount}}

Please pay by {{date: due; default=+7d; format=D MMM YYYY}} to secure your seat. Classes begin on {{date: start; label=Classes begin; default=+30d; format=D MMMM}}.

Welcome to {{me.company}}! 🎉`,
  },
];
