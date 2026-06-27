# Platform Standards

## Core Platform Services

All reusable services are implemented as platform modules.

Current platform:

- tge-output.js
- tge-progress.js
- tge-pdf.js
- tge-diagnostics.js

Naming standard:

Files
- lower-case
- tge- prefix

Namespace

TGE

Services

TGE.output
TGE.progress
TGE.pdf
TGE.diagnostics

Methods

camelCase

Examples

TGE.output.export()
TGE.progress.run()
TGE.pdf.generate()
TGE.diagnostics.log()


# Build Standards

Every new module shall:

- use the platform services
- not duplicate shared functionality
- support Roles
- support Permissions
- support Limits
- support Output
- support PDF
- support Diagnostics
- support Activity Logging where applicable

- # Documentation Standards

Update documentation:

- after every 10 bug fixes
- after any major bug fix
- after every new platform service
- after every architecture decision
- before release

- # Module Decommission Standard

A module is not considered removed until:

- JavaScript removed
- HTML removed
- Navigation removed
- Roles removed
- Permissions removed
- Event handlers removed
- CSS removed
- API routes removed
- Search confirms no remaining references


# Diagnostics Platform

Two diagnostics systems exist.

Runtime Diagnostics

Purpose

- API requests
- API responses
- Errors
- Performance
- Events

Available from header diagnostics.

Supports:

- Docked
- Floating

System Health

Located under:

Admin
    Management
        System Health

Provides:

- application health
- configuration
- defects
- diagnostics
- export



## Current Build Phase

Phase 1
Platform Foundation      ✓

Phase 2
Asset Track             In Progress

Phase 3
Snapshot                Pending

Phase 4
Camera Requests         Pending

Phase 5
Workflow Engine         Pending

Phase 6
Production Hardening    Pending
