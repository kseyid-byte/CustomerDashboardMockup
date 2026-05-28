# Changelog & Request Attribution Policy

Because the coding agent receives requests from multiple people, every functional change must record who requested it.

## Required for Every Change

Every entry in `CHANGELOG.md` must include one of the following tags:

- Requested by: <Name>
- Internal improvement
- Bug fix

Example:

- Added hover expansion for scenario tables to improve readability of wide matrices. Requested by: Product Team.

or

- Fixed mobile layout overflow in product trend panel. Bug fix.

or

- Refactored table rendering logic for performance. Internal improvement.

## Rules

1. Never guess who requested a change.
2. If the requester is unknown, use **Internal improvement**.
3. If something broke and is corrected, label it **Bug fix**.
4. UI/feature changes requested by stakeholders must explicitly name the requester.
5. Changes must be added to `CHANGELOG.md` in the same commit or immediately after.

## Purpose

This ensures:

- Traceability of requests
- Transparency for dashboard users
- Accountability when multiple people interact with the coding agent
