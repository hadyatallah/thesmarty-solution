# TSS publishing watchdog

The GitHub publisher remains the only component that can call Meta publishing.
Its scheduled triggers did not start on17September2026, although push-triggered
runs completed. Workflow metadata reports active. The provider-side reason for
the absent triggers is not established. UTC wake-up changes alone did not restore
delivery, so they must not be described as a verified scheduler fix.

An independent ChatGPT task checks delivery using the GitHub connector in
Asia/Nicosia. It reads current main manifests, publishing configuration, workflow
runs and tss-social-state history. When a QA-approved item is due today, less
than four hours old, has no history entry or unresolved outcome, and no publisher
run is queued/in progress, it may update only social/scheduler-wakeup.json on
main. That normal push starts the existing workflow, which enforces all QA,
account, duplicate, format and volume checks before any Meta side effect.

A wake-up is not an approval, reservation, direct API call or retry of an uncertain
publication. Never alter a manifest, its publishAt, source checks, review seal,
history or publishing limits to make a post eligible. Never create a second copy.
No more than one watchdog wake-up per pending post per Cyprus calendar day.
If the wake-up fails, inspect the safe result and notify Hady instead of repeating
it. In-flight, reserved, partial or uncertain records are never retried.

Report actual verified publication links after recovery. Report blockers or a
missing result. Remain silent when no action is needed. A successful workflow
without the intended publication is not proof of delivery. Empty or expired
queues require content preparation, not repeated wake-ups.

Never read or disclose credentials. Preserve website, CRM, enquiries, Sheets,
Microsoft365, SEO and Metricool. The existing post-review notifier remains
read-only and separate.
