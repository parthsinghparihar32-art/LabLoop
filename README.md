# LabLoop ♻️

### Smart Campus Resource Sharing & Utilization Platform

**Making underused campus resources accessible, accountable, and fairly shared.**

LabLoop is a campus resource-sharing platform designed to help students and researchers discover, request, and use underutilized college equipment, laboratories, and spaces.

Instead of purchasing additional resources unnecessarily, LabLoop helps institutions make better use of existing resources through centralized discovery, booking workflows, credential verification, fair-access mechanisms, and usage tracking.

> **Project status:** In Development · Hackathon Project

---

## 📌 Table of Contents

- [Problem Statement](#-problem-statement)
- [Our Solution](#-our-solution)
- [Key Features](#-key-features)
- [User Roles](#-user-roles)
- [Technology Stack](#-technology-stack)
- [System Architecture](#-system-architecture)
- [Database Architecture](#-database-architecture)
- [Booking Workflow](#-booking-workflow)
- [GitHub Branch Strategy](#-github-branch-strategy)
- [Team Responsibilities](#-team-responsibilities)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Security](#-security)
- [Project Roadmap](#-project-roadmap)

---

## 🎯 Problem Statement

College equipment, laboratories, project rooms, and specialized facilities may remain underutilized while students struggle to find or access the resources they need.

Common challenges include:

- Lack of visibility into available resources.
- Manual and inconsistent booking processes.
- Scheduling conflicts for high-demand equipment.
- Training and eligibility verification challenges.
- Unclear records of equipment condition and usage.
- Limited transparency in resource allocation.

LabLoop aims to address these challenges through one centralized platform.

## 💡 Our Solution

LabLoop connects available campus resources with students who need them.

Users can discover resources, check requirements, submit booking requests, and track their reservations. Resource owners can manage availability, review requests, and monitor usage.

The platform also introduces credential tracking, an auditable credit system, explainable fair-access recommendations, and condition reporting.

## ✨ Key Features

### 1. Resource Discovery

- Search and filter equipment, laboratories, and spaces.
- View resource descriptions, locations, usage rules, and availability.
- Check booking costs and eligibility requirements.

### 2. Smart Booking Management

- Submit booking requests for specific time slots.
- Validate eligibility and available credits.
- Prevent conflicting reservations.
- Allow authorized owners to approve or reject requests.
- Track booking status and history.

### 3. Credential Passport

- Maintain reusable training and credential records.
- Display pending, verified, rejected, or expired credentials.
- Support authorized verification for restricted resources.

### 4. FairShare Credits

- Support configurable credit costs for resource usage.
- Track credit grants, spending, refunds, and adjustments.
- Maintain an auditable credit ledger.
- Encourage transparent allocation of limited resources.

Credit rates and allowance policies will be configurable examples until institutional rules are established.

### 5. Explainable Fairness

- Support transparent resource-allocation recommendations.
- Consider relevant factors such as waiting time and recent usage.
- Explain why a request receives a recommendation.
- Keep final booking decisions with authorized resource owners.

### 6. Condition Passport & Trust Timeline

- Record equipment condition at check-in and return.
- Support notes and optional evidence photos.
- Maintain a history of usage and condition reports.
- Enable incident reporting and human review.

### 7. AI-Assisted Resource Search

- Interpret natural-language resource requests.
- Find relevant resources from the actual catalogue.
- Explain why resources match a user's request.
- Provide ordinary search as a fallback if AI is unavailable.

AI will not independently verify credentials, approve restricted bookings, or assign blame for incidents.

---

## 👥 User Roles

| Role                 | Responsibilities                                                            |
| -------------------- | --------------------------------------------------------------------------- |
| Student / Researcher | Discover resources, request bookings, manage reservations, and view credits |
| Resource Owner       | Manage resources, availability, and booking decisions                       |
| Authorized Verifier  | Review and verify required credentials                                      |
| Administrator        | Oversee authorized platform operations and review records                   |

Access to data and actions will be controlled through server-side authorization and database policies.

---

## 🛠️ Technology Stack

| Technology                  | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| Next.js                     | Web application and server-side functionality |
| TypeScript                  | Type safety and maintainable code             |
| Tailwind CSS                | Responsive styling                            |
| Supabase Auth               | Authentication                                |
| PostgreSQL                  | Relational database                           |
| Supabase Row Level Security | Database access control                       |
| Supabase Storage            | Optional condition photos and evidence        |
| Zod                         | Input validation                              |
| QR code library             | Booking check-in workflow                     |
| AI API                      | Natural-language resource search              |
| Vercel                      | Application deployment                        |
| GitHub                      | Version control and collaboration             |

The final implementation may adapt these choices to the existing project structure and available services.

---

## 🏗️ System Architecture

```text
                 USERS
     Students | Owners | Admins
                   |
                   v
           NEXT.JS FRONTEND
    Catalogue | Dashboard | Booking
                   |
                   v
       SERVER-SIDE APPLICATION
    Authentication and Authorization
    Validation | Booking | Credit Logic
                   |
                   v
               SUPABASE
        +----------------------+
        | PostgreSQL Database  |
        | Supabase Auth        |
        | Row Level Security   |
        | Optional Storage     |
        +----------------------+
                   |
                   v
       Persistent Records and Audit
```

AI-assisted search will connect through a server-side integration and use the actual resource catalogue.

---

## 🗄️ Database Architecture

The proposed relational database consists of eight main tables:

| Table               | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `profiles`          | User profiles and application roles          |
| `resources`         | Equipment, laboratories, and spaces          |
| `bookings`          | Booking requests, schedules, and statuses    |
| `credentials`       | Training and credential verification records |
| `credit_ledger`     | Auditable credit transactions                |
| `condition_reports` | Check-in and return condition records        |
| `incidents`         | Reported problems and review outcomes        |
| `audit_logs`        | Records of important platform actions        |

### Database Relationships

- A profile can own multiple resources.
- A profile can request multiple bookings.
- A resource can have multiple booking records.
- A booking can generate related credit transactions.
- A booking can have check-in and return condition reports.
- Incidents can be associated with a booking or resource.
- Profiles can hold multiple credentials.
- Important actions can be recorded in the audit log.

The schema is implemented through version-controlled SQL migrations in `supabase/migrations/`. Full architectural details, RLS policies, atomic functions, and API contracts are documented in [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md).

### Booking Statuses

The shared booking status contract is:

`requested` → `approved` → `checked_in` → `returned` → `completed`

Alternative permitted outcomes include `rejected` and `cancelled`.

Transitions must be validated by trusted backend operations, and overlapping approved bookings must be prevented.

---

## 🔄 Booking Workflow

1. A student discovers a resource.
2. The student checks availability, credits, and eligibility.
3. The student submits a booking request.
4. The system validates the request and prevents scheduling conflicts.
5. An authorized owner approves or rejects the request.
6. The student checks in using the supported check-in workflow.
7. Initial and return conditions are recorded.
8. The booking is completed and relevant records are retained.

The workflow will be tested end-to-end as features are implemented.

---

## 🌿 GitHub Branch Strategy

The project uses a shared repository and separate feature branches.

| Team Member | Branch                 | Responsibility                                         |
| ----------- | ---------------------- | ------------------------------------------------------ |
| Member 1    | `feat/frontend-ui`     | Frontend and UI/UX                                     |
| Member 2    | `feat/backend-booking` | Backend, database, booking logic, and security         |
| Member 3    | `feat/trust-fairness`  | Credentials, fairness, credits, and resource lifecycle |
| Member 4    | `feat/ai-deployment`   | AI, integration, testing, and deployment               |

### Collaboration Workflow

1. Create or switch to the assigned feature branch.
2. Implement and test the assigned changes.
3. Commit changes with descriptive messages.
4. Push the feature branch to GitHub.
5. Open a Pull Request targeting `main`.
6. Review and test the changes before merging.

**Important:** Do not push feature code directly to `main`. Coordinate shared files and data contracts before changing them.

---

## 👨‍💻 Team Responsibilities

### Member 1 — Frontend & UI/UX

- Build responsive application pages.
- Implement the resource catalogue and dashboards.
- Create booking forms and status views.
- Integrate with shared backend interfaces.

### Member 2 — Backend & Database

- Design and implement PostgreSQL migrations.
- Configure Supabase authentication and Row Level Security.
- Implement resource and booking operations.
- Prevent overlapping bookings and unauthorized actions.
- Implement auditable credit transactions.
- Document shared API and database contracts.

### Member 3 — Trust, Fairness & Lifecycle

- Implement Credential Passport workflows.
- Integrate FairShare credit displays and transaction history.
- Build explainable fairness recommendations.
- Implement check-in, return, condition reports, and incident review.

### Member 4 — AI, Integration & Deployment

- Implement one focused AI-assisted feature.
- Integrate the shared application components.
- Configure deployment and environment variables.
- Test the deployed workflow.
- Maintain setup documentation and demo instructions.

---

## 🚀 Getting Started

### Prerequisites

Install the following before starting:

- Git
- Node.js version compatible with the project's `package.json`
- npm, or the package manager used by the repository
- A Supabase account and project when database integration is ready

### 1. Clone the repository

```bash
git clone https://github.com/parthsinghparihar32-art/LabLoop.git
cd LabLoop
```

### 2. Install dependencies

```bash
npm install
```

Use the existing lockfile and package manager where applicable.

### 3. Configure environment variables

Create a local `.env.local` file using the variable names documented in `.env.example`.

Do not commit `.env.local`.

### 4. Configure the database

Follow the documented Supabase setup and migration instructions once the database migrations are available.

### 5. Start the development server

```bash
npm run dev
```

Open the local URL printed by Next.js in your terminal.

Available commands depend on the scripts configured in `package.json`.

---

## 🔐 Environment Variables

The application may require the following configuration, depending on the implemented features:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Use the publishable-key variable name appropriate to the installed Supabase setup. If the project uses a different variable name, follow the existing implementation.

AI API keys and privileged server-side credentials must use server-only environment variables and must never be exposed to browser code.

The committed `.env.example` must contain placeholders only.

---

## 🛡️ Security

LabLoop is designed around the following security principles:

- Supabase Row Level Security for protected database records.
- Server-side validation of booking requests and privileged actions.
- Role-based authorization for resource owners and verifiers.
- Database-level protection against conflicting bookings.
- Auditable credit transactions with duplicate-operation protection.
- Restricted access to condition photos and incident evidence.
- No secrets, passwords, or private keys committed to GitHub.
- No automatic penalties or blame assignment based solely on AI output.

These protections must be implemented and tested before claiming production readiness.

---

## 🗺️ Project Roadmap

- Establish shared repository and team branches.
- Implement database schema and migrations.
- Configure authentication and database security policies.
- Implement resource discovery and booking operations.
- Add credit ledger and booking conflict prevention.
- Implement Credential Passport and eligibility checks.
- Implement check-in, return, and condition reporting.
- Add explainable fairness recommendations.
- Integrate AI-assisted resource search.
- Deploy and test the complete application.
- Complete documentation and demo preparation.

---

## 🌱 Expected Impact

LabLoop aims to help educational institutions:

- Improve utilization of existing equipment and spaces.
- Make resource discovery easier for students.
- Support safer access to specialized equipment.
- Encourage transparent resource allocation.
- Maintain consistent usage and condition records.
- Use utilization data to inform future resource planning.

The actual impact will depend on institutional adoption, reliable data, and fair access policies.

---

## 📄 Project Information

**Project:** LabLoop

**Category:** Campus Resource Sharing & Utilization

**Repository:** [https://github.com/parthsinghparihar32-art/LabLoop](https://github.com/parthsinghparihar32-art/LabLoop)

**Development approach:** Collaborative, branch-based development with Pull Requests and incremental integration.

Built as a hackathon project with a focus on practical campus resource sharing, trust, and responsible utilization.
