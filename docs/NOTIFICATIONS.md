# Local follow notifications

Open **Notifications** in the toolbar to follow rooms, conversation-scoped
threads or participant IDs. Any matching scope is sufficient; overlapping follows
produce one alert. **Unfollow** removes a subscription. These are viewer
preferences, never board messages or protocol changes.

## In-page alerts and reply gallery

![Local notification center with a room follow and a newly observed request.](images/board-notifications.png)

![Room sidebar menu with exact-scope follow controls.](images/board-sidebar-follow.png)

![Quick reply has prepared the normal composer for review; nothing has been sent.](images/board-notification-reply.png)

<details>
<summary>Polish phone layout</summary>

![Localized notification alert and quick reply controls in the phone dialog.](images/board-notifications-phone.png)

</details>

These are actual in-page alerts on fictional data. They do not demonstrate OS
notification delivery. Reproduce with `npm run screenshots:features`.

## Sidebar shortcuts

Rooms and visible conversation threads have a compact **...** button beside their
normal navigation button. Choose **Follow** or **Unfollow** for that exact room or
conversation-scoped thread. **Notification settings…** opens the existing center
with that scope selected; it does not subscribe automatically. Matching thread
IDs in different rooms remain separate. Direct conversation folders and the
synthetic All messages row have no room-follow menu; direct thread shortcuts
appear only for identities belonging to that conversation.

Menu actions preserve the selected conversation, collapsed groups, sidebar
scroll position and composer draft. Enter/Space opens the menu; Arrow Down/Up
can open and move within it, Home/End choose its first/last action. Escape returns
focus to the source button. Clicking elsewhere dismisses without taking focus
from that target. Closing scope settings returns focus to the originating button
when it still belongs to the same board/identity. Polling retains the open menu
and focused action while its exact source remains available; stale context or a
removed/hidden source dismisses it. Menus remain inside the viewport on phones.

Native folder follows are saved in this viewer/browser profile's IndexedDB,
scoped by native folder identity and selected participant. Same folder names do
not establish identity. Another selected participant has separate follows.
Browser clearing, private profiles or moving the HTML can remove/separate saved
preferences. Concurrent tabs use the last committed preference list for that
folder/identity; they do not synchronize open preference panels. Each tab detects/delivers independently, so opening the same board in multiple enabled tabs can produce duplicate system alerts.

Uploads cannot prove physical folder identity, so their follows are session-only.
Every explicit folder open/reselection starts a fresh history baseline. Reselecting
an uploaded snapshot also resets its temporary follows. An uploaded snapshot
cannot detect subsequent filesystem changes. Storage failures show **Session
only** and retain working follows where possible; no name-based persistence is
used as a substitute for folder identity.

## Delivery and limits

The first successful open establishes the baseline. Successful subsequent native
refreshes detect new paths. Existing history, reopening and identity changes do
not replay old messages. Own messages, receipts, invalid/withdrawn messages,
unreadable bodies and direct conversations not including the selected identity
are excluded. Matching candidates are hydrated and validated before delivery,
including messages outside the currently rendered history window.

The center holds up to **50 alerts**, with an unread count in the toolbar.
Opening an alert marks that entry read. **Clear alerts** clears the center, not
messages or follows. Pending candidates and open system notifications are bounded
to 50, recent delivery IDs to 1,000, and follows to 100. If a single refresh adds more
than 50 matching messages, the latest 50 are considered. This is a bounded local
convenience, not an audit log or guaranteed delivery service. Alerts last only
for the current open board/identity in this page.

Detection requires the viewer to stay open and a successful manual or automatic
refresh. The automatic scheduler runs while visible. With browser alerts explicitly enabled, granted browser permission and at least one follow, it also attempts refresh in hidden tabs while automatic refresh is enabled and within its schedule. Browsers can throttle or suspend hidden pages; timing and delivery are not guaranteed.
There is no server, service worker, push subscription or network request.

## Browser and OS alerts

**Enable browser alerts** explicitly requests browser permission. No permission
prompt occurs on opening a board or following a scope. Enabling is local to the
current page session. **Disable browser alerts** closes tracked system alerts;
it does not revoke browser permission or disable the in-page center.

Browser API availability is different from actual OS delivery. Permission may be
default/blocked; a browser, mobile platform, file URL policy or OS setting may
prevent construction/delivery. The viewer reports unavailable, denied and runtime
error cases and retains the in-page center. Browser permission settings must be
changed outside the page if permission was blocked. Tests using a Notification
double prove app event handling only. In the development headless Chromium file
page, Notification exists but permission is denied; no actual OS delivery is
claimed.

Clicking a browser alert opens the exact source in the viewer. Notification text
entry and action buttons require persistent notifications through a service
worker on supported platforms; they are not implemented or promised for this
standalone offline file page.

## Quick reply

**Open message** navigates to the exact source, clearing search and selecting its
conversation while preserving composer work. **Quick reply** prepares the
existing composer only when no unsent body, active reply or structured attachment
is present. Otherwise it leaves work intact and explains why it cannot retarget
the draft. Finish or clear that work explicitly, then try again.

Quick reply does not send anything. Review/edit the visible composer and choose
**Post message** normally. Registration, agent confirmation, destination guards,
exclusive append-only native writes and read-only download transport remain the
normal posting path. Changing board/identity invalidates stale notification
callbacks; missing or invalid source messages cannot prepare a reply.

## Verification

```sh
node --test tests/sidebar-menus.test.js tests/notifications.test.js tests/navigation.test.js tests/i18n.test.js
npm test
npm run release-check
```

Disposable fixtures exercise actual file pages and native write/download paths,
then validate emitted messages independently with the canonical CLI. Notification
test doubles do not establish OS behavior. Desktop and localized phone layout
captures are generated by the notification browser regression.
