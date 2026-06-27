# Snapshot Project Architecture

## Project Standards

Platform-first architecture.

Modules do not duplicate functionality.

Shared services provide all common functionality.

---

## Platform Services

tge-output.js

Purpose

Application output.

Namespace

TGE.output

---

tge-progress.js

Purpose

Progress and loading.

Namespace

TGE.progress

---

tge-pdf.js

Purpose

PDF generation.

Namespace

TGE.pdf

---

tge-diagnostics.js

Purpose

Runtime diagnostics.

Namespace

TGE.diagnostics

Provides

* Runtime API logging
* Request viewer
* Response viewer
* Export
* Copy
* Floating diagnostics
* Browser tab diagnostics

---

## Module Lifecycle

Every module follows:

Design

↓

Development

↓

Platform Integration

↓

Diagnostics

↓

QA

↓

LOCK

↓

Maintenance

---

## Documentation Updates

Update documentation after:

* 10 bug fixes
* Major feature
* Architecture change

---

## Module Status

Platform

✓ Complete

Asset Track

✓ Locked

Snapshot

In Progress

Camera Requests

Pending

Workflow Engine

Pending

API Management

Pending

Production Hardening

Pending

---

## Engineering Rules

* Lower-case file names.
* CamelCase methods.
* Platform namespaces only.
* No duplicate code.
* No legacy code.
* Remove obsolete functionality during refactoring.
* QA before module lock.
* Locked modules receive bug fixes only.

---

## Long-term Roadmap

Roles Platform

* Batch Limit
* Usage Limit
* Expanded permissions

Diagnostics Platform

* Runtime Events
* System Health
* Performance Metrics
* Module Events

Production

Asset Track remains the reference implementation for future modules.
