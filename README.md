# Parkhill Field Reports

A web-based commissioning field application for Parkhill engineers.

An engineer standing in a mechanical room records what they found, works
through the potential causes and the corrective actions they are prepared to
put their name to, and produces a professional field report — on a phone, in
the field, in one pass. Records are stored against the project they belong to
in Parkhill-controlled Azure services.

The workflow is deliberately engineer-led. The app suggests; the engineer
decides. Nothing reaches a report unless it has been explicitly selected, and
every suggestion can be reworded or replaced.

```
Project  →  Field Observation  →  Potential Failure Causes
                                       ↓
              Report Preview  ←  Suggested Corrective Actions
```

> **AI suggestions come from OpenAI.** Steps 2 and 3 call `gpt-5.5` from the
> server with the observation text and photos. See [AI
> suggestions](#ai-suggestions).

---

## Contents

- [Technologies](#technologies)
- [Azure setup](#azure-setup)
- [Authentication](#authentication)
- [Local development](#local-development)
- [Project structure](#project-structure)
- [How the data is stored](#how-the-data-is-stored)
- [AI suggestions](#ai-suggestions)
- [Deploying to Azure](#deploying-to-azure)
- [Design and branding](#design-and-branding)
- [Known follow-ups](#known-follow-ups)

---

## Technologies

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) — front end and API in one deployable |
| UI | React 19, TypeScript, Chakra UI v3 |
| State | React Context for the in-progress observation, mirrored to `sessionStorage` |
| Backend | Next.js route handlers under `src/app/api` |
| Database | Azure Cosmos DB (NoSQL API) |
| File storage | Azure Blob Storage (private container) |
| Azure auth | Managed identity via `DefaultAzureCredential` — no keys, no connection strings |
| Sign-in | SAML 2.0 against Microsoft Entra ID, restricted to Parkhill staff |
| Hosting | Azure App Service (Linux, Node), `output: "standalone"` |

There are no proprietary or platform-specific dependencies. The repository is
a standard Next.js application that any Node 20+ environment can build and run.

---

## Azure setup

This build has **no offline or in-memory mode**: the app needs a real Cosmos DB
and Blob Storage account to start. The three subsections below are all
required.

### 1. Resources

| Resource | Setting |
| --- | --- |
| Cosmos DB account | **NoSQL** API. Serverless capacity suits this workload. |
| Cosmos database | `parkhillcxfield` |
| Cosmos container | `projects` — partition key `/projectNumber` |
| Cosmos container | `observations` — partition key `/projectNumber` |
| Storage container | `field-photos` — public access level **Private** |

Names other than the account names are configurable; see
[`.env.example`](.env.example).

### 2. Role assignments

Assign these to **both** the App Service's system-assigned managed identity
*and* to your own user account, so the app works in Azure and locally.

| Scope | Role | Needed for |
| --- | --- | --- |
| Cosmos DB account | Cosmos DB Built-in Data Contributor | reading and writing documents |
| Storage account | Storage Blob Data Contributor | reading and writing photo blobs |
| Storage account | Storage Blob Delegator | signing the short-lived photo URLs |

Two things that commonly cost an afternoon:

**Cosmos data-plane roles cannot be assigned from the portal's IAM blade.**
That blade grants control-plane roles only. Use the CLI:

```bash
az cosmosdb sql role assignment create \
  --account-name <cosmos-account> \
  --resource-group <resource-group> \
  --scope "/" \
  --principal-id <object-id-of-user-or-managed-identity> \
  --role-definition-id 00000000-0000-0000-0000-000000000002
```

**Storage Blob Delegator is a separate role from Storage Blob Data
Contributor.** Without it, `getUserDelegationKey()` fails and photos will not
render in reports even though uploads succeed. If your policy will not allow
that role, the alternative is to stream blobs through a route handler instead
of issuing signed URLs — a change confined to
[`src/lib/azure/blob.ts`](src/lib/azure/blob.ts) and the `photos/sas` route.

### 3. Configuration

Copy [`.env.example`](.env.example) to `.env.local` and fill in the two
endpoints. Every variable is an endpoint or a resource name — **none of them
are secrets**, which is the point of using a managed identity. In Azure, set
the same variables as App Service application settings.

---

## Local development

**Prerequisites:** Node 20.9 or newer (24.x recommended), and the Azure CLI.

```bash
# One time: sign in so DefaultAzureCredential has a local credential source.
# Without this, every Cosmos and Blob call fails.
winget install --exact --id Microsoft.AzureCLI   # Windows
az login

# Then:
npm install
cp .env.example .env.local      # and fill it in
npm run dev
```

Sign-in also has to be configured before the app is usable, because `/` is a
sign-in page and everything else is behind it — see
[Authentication](#authentication). At minimum you need `SESSION_SECRET`,
`APP_BASE_URL`, `PARKHILL_TENANT_ID`, `SAML_ENTRY_POINT` and `SAML_IDP_CERT`.

Open <http://localhost:3000>. Available scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build (`.next/standalone`) |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

If the app starts but every page errors, read the message: a missing
environment variable is reported by name, with a pointer back to this section.

### If Azure calls fail locally with "CredentialUnavailableError"

`DefaultAzureCredential` reaches the Azure CLI by *executing* `az`, so being
signed in is not sufficient - the Node process must be able to find the
executable on its `PATH`. A dev server started before the CLI was installed
(or from an editor launched before then) inherits the old `PATH` and fails
with:

```
CredentialUnavailableError: Azure CLI could not be found.
```

Restart the dev server from a shell where `az --version` works. On Windows,
opening a new terminal inside an already-running VS Code is not enough - VS
Code hands each terminal its own stale environment, so quit and reopen it.

This affects local development only. In Azure, `ManagedIdentityCredential`
answers through IMDS before the CLI is ever attempted.

### Cosmos role assignments take a few minutes

After granting **Cosmos DB Built-in Data Contributor**, expect several minutes
of `403 ... does not have required RBAC permissions` before it settles, and
expect it to be *intermittent* while it propagates - Cosmos evaluates the
assignment per region, so some requests succeed while others still fail. It is
not a sign that the assignment was wrong; verify it with:

```bash
az cosmosdb sql role assignment list --account-name <account> --resource-group <rg> -o table
```

---

## Project structure

```
src/
  proxy.ts                 The access gate in front of every route
  app/                     Routes (App Router). Pages and API in one tree.
    layout.tsx             Root layout: providers, fonts, viewport
    providers.tsx          Chakra provider
    page.tsx               The sign-in page (public)
    (app)/                 Everything behind sign-in
      layout.tsx           Adds the application header
      projects/            Project list, project detail
        [projectNumber]/
          observations/
            new/           The four-step workflow, one route per step
            [observationId]/  A saved report
    api/                   Server-side route handlers
      saml/                login, acs, logout, metadata
  components/              Reusable components
  context/                 ObservationDraftContext — the in-progress record
  hooks/                   useStepGuard, usePhotoUrls
  lib/                     Utilities, validation, Azure clients
    auth/                  SAML provider, session, access rules (server-only)
    azure/                 Cosmos, Blob and credential setup (server-only)
  repositories/            All Cosmos access (server-only)
  services/                The client's only door to the server
  theme/                   Design tokens — the one place brand colour is set
  types/                   Shared types across client and server
```

The `(app)` folder is a route group: it adds the header to everything inside
it without appearing in URLs, so `/projects` stays `/projects` while the
sign-in page renders without application chrome.

Three conventions worth preserving:

- **Access control lives only in `src/proxy.ts`.** Routes are protected unless
  explicitly listed as public there. That is the only arrangement that stays
  correct when someone adds a route later and forgets to think about auth — so
  resist adding per-page checks alongside it.

- **Components never call `fetch`.** Every network call goes through
  `src/services`, so error handling is uniform and the API surface is visible
  in one folder.
- **Components never touch Azure.** Route handlers call `src/repositories`,
  which own all database access. `src/lib/azure` and `src/repositories` import
  `server-only`, so an accidental import from client code fails the build
  rather than leaking at runtime.

> **A note for reviewers holding the original specification.** That document
> described a React SPA with `src/pages/` and a future FastAPI backend. This is
> a Next.js app, so `src/pages/` became `src/app/` route segments (page-level
> components still live apart from reusable ones), and the FastAPI tier became
> route handlers in this repository. The guarantee that mattered is unchanged:
> **the browser never calls a model provider and never sees a credential.**

### How state flows through the workflow

Each of the four steps is a real route rather than a step counter in component
state. On a phone the browser's back gesture is the primary way people
navigate, and with a counter "back" leaves the app and destroys the engineer's
field notes; with routes it walks the wizard.

The draft lives in `ObservationDraftContext`, mounted in the wizard's layout —
which client-side navigation does not remount, so Step 1's data is still in
memory at Step 4. It is also mirrored to `sessionStorage`, so a backgrounded
tab or an accidental reload does not lose work.

Nothing is written to Cosmos until **Save** on Step 4. Photos are the
exception: they upload as soon as they are chosen, because a dead battery
should not cost the engineer their pictures.

---

## How the data is stored

### Projects (`projects` container)

```json
{
  "id": "24-1057",
  "projectNumber": "24-1057",
  "name": "Midland ISD Natatorium",
  "createdAt": "2026-09-02T14:33:00.000Z",
  "createdBy": "tbalderas@parkhill.com",
  "updatedAt": "2026-09-02T14:33:00.000Z"
}
```

`id` is set equal to `projectNumber`. Because the id and the partition key are
then identical, every project lookup is a point read — the cheapest operation
Cosmos offers — and uniqueness of project numbers is enforced by the database
rather than by an application check that could race.

### Observations (`observations` container)

Partitioned on `/projectNumber`, so "every observation for this project" is a
single-partition query. That is the app's dominant read, and the reason for
the partition key.

Only the causes and corrective actions the engineer **selected** are stored.
The rejected suggestions are not part of the record — what matters is the
determination, not the list it came from.

### Photos (`field-photos` container)

```
field-photos/{projectNumber}/{observationId}/{photoId}.jpg
```

The container is private. Photos are uploaded through the app server, and the
report reads them back through user-delegation SAS URLs valid for about fifteen
minutes, so image bytes are fetched straight from Blob Storage without the
container ever being publicly readable.

Every photo is downscaled to a 1600px long edge and re-encoded as JPEG **in the
browser, before upload**. A phone photo is 3–5 MB; the stored version is
typically 200–400 KB. On field LTE that is the difference between an upload
that works and one that does not, and it is also what makes reports fast to
open later.

Because the project number is used as a Cosmos id, a Cosmos partition key
*and* a blob path segment, it is validated once against a single pattern in
[`src/lib/validation.ts`](src/lib/validation.ts) before it can reach either
store.

---

## AI suggestions

Steps 2 and 3 are generated by OpenAI from the server. The whole integration is
[`src/lib/ai/suggestions.ts`](src/lib/ai/suggestions.ts), called by
[`src/app/api/failure-causes/route.ts`](src/app/api/failure-causes/route.ts) and
[`src/app/api/corrective-actions/route.ts`](src/app/api/corrective-actions/route.ts).

| Step | The prompt is built from |
| --- | --- |
| Potential failure causes | Equipment, System, Location, Activity / Test, the Observation / What Was Found text, and the photos |
| Suggested corrective actions | the same, plus every selected cause — including ones the engineer added |

- **Photos** are sent as blob paths from the browser. The server checks they
  belong to the project, reads up to six from Blob Storage with its managed
  identity, and sends them to OpenAI inline. No link to a private photo is
  given to a third party.
- **Output** is constrained to a JSON schema, so the model always returns a
  plain list of suggestions. Nothing is pre-selected.

| Setting | |
| --- | --- |
| `OPENAI_API_KEY` | Required. Locally in `.env`; in Azure as an App Service application setting (or a Key Vault reference). |
| `OPENAI_MODEL` | Optional, defaults to `gpt-5.5`. Must be a vision-capable model. |

**Rules that must not be relaxed:**

- Never call a model provider from browser code.
- Never put a credential in a `NEXT_PUBLIC_*` variable — that prefix ships the
  value to the browser.
- Keep the credential out of the repository.

When a request fails, the browser shows a generic message and the server log
has OpenAI's own explanation (invalid key, unknown model, quota exceeded).

---

## Deploying to Azure

The included workflow —
[`.github/workflows/azure-appservice.yml`](.github/workflows/azure-appservice.yml)
— builds, lints, type-checks and deploys to App Service on every push to
`main`. It needs:

- Repository **variable** `AZURE_WEBAPP_NAME`
- Repository **secrets** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and
  `AZURE_SUBSCRIPTION_ID` for the OIDC deploy identity that App Service →
  Deployment Center creates. No publish profile is needed.

And on the App Service itself, one time:

- **Startup command:** `node server.js`
- **Application settings:** the variables from `.env.example`, including
  `SESSION_SECRET` and the SAML values. `APP_BASE_URL` must be the real public
  URL and must match what is registered in Entra, or sign-in will fail with an
  audience mismatch.
- **Identity → System assigned → On**, with the three roles from
  [Azure setup](#azure-setup) assigned to that identity
- **HTTPS only → On.** The session cookie is marked `Secure` in production, so
  it will not be sent over plain HTTP.

The build uses `output: "standalone"`, which emits a self-contained server that
does not need `node_modules` at runtime. The workflow copies `public/` and
`.next/static/` into the package — the standalone output excludes them by
design, and omitting that step produces an app that starts but renders
unstyled.

The OIDC login is only used to upload the build. At runtime the app holds
no Azure credentials of its own; it uses its managed identity.

---

## Authentication

Sign-in is **SAML 2.0 against Microsoft Entra ID**, implemented in this
repository as its own service provider. `/` is a sign-in page; everything else
requires a session.

### Who can sign in

Three rules, all enforced in
[`src/lib/auth/authorize.ts`](src/lib/auth/authorize.ts):

1. **The assertion must come from the Parkhill tenant** — the `tenantid` claim
   must equal `PARKHILL_TENANT_ID`.
2. **Guest accounts are rejected.** Entra stamps `#EXT#` into the user
   principal name of every B2B guest. This matters because a guest genuinely
   *is* in the Parkhill tenant, so a tenant check alone does not mean "Parkhill
   staff" — contractors and vendors invited into the directory would otherwise
   pass.
3. **Optionally, an email-domain allow-list** via
   `SAML_ALLOWED_EMAIL_DOMAINS`, for tenants hosting more than one
   organisation's staff. Leave it blank to allow any non-guest tenant member.

If `PARKHILL_TENANT_ID` is not set, the app refuses *everyone* rather than
letting everyone in — misconfiguration fails closed.

### How the flow works

```
/                          sign-in page
  → GET  /api/saml/login   builds an AuthnRequest, redirects to Entra
  → (Entra authenticates the user)
  → POST /api/saml/acs     validates the assertion, issues a session cookie
  → /projects
```

The Assertion Consumer Service performs four checks in order, and nothing is
trusted until all four pass:

| Check | Guards against |
| --- | --- |
| RelayState signature | a sign-in this app did not start |
| XML signature, audience, issuer, validity window | forged or borrowed assertions |
| `InResponseTo` matches the request we issued | an assertion replayed into a different login |
| Tenant and guest rules | the wrong people |

The session is a signed JWT in an HttpOnly cookie, valid for 10 hours. It is
deliberately **stateless**, so there is no session store to run and it keeps
working when App Service scales out to more than one instance.

Two notes on why the code looks the way it does:

- **`InResponseTo` is checked by this app, not by node-saml.** node-saml's own
  check needs a shared cache of issued request ids, and its bundled in-memory
  cache is documented as unsuitable once more than one instance is running.
  Instead the login route signs the request id into `RelayState`, which the
  identity provider echoes back untouched.
- **`RelayState` is used rather than a temporary cookie.** Entra returns the
  user by cross-site POST, and a `SameSite=Lax` cookie is withheld on exactly
  that request. `SameSite=None` would work but requires HTTPS, which would make
  local development impossible.

### Registering the enterprise application

Create it as a **non-gallery enterprise application** — not an app
registration. The SAML single-sign-on screen only exists on enterprise
applications; an app registration gives you OIDC/OAuth only, and its
"Single sign-on" page will not offer SAML.

At <https://entra.microsoft.com> → **Entra ID** → **Enterprise apps** →
**All applications** → **New application** → **Create your own application** →
name it → choose **Integrate any other application you don't find in the
gallery (Non-gallery)** → **Create**. Then **Manage → Single sign-on → SAML**.

**It must stay single-tenant.** Microsoft's documentation states that SAML SSO
is only configurable on single-tenant applications — on a multi-tenant app the
SAML options are greyed out. Single-tenant is also what restricts sign-in to
Parkhill, so this is the right setting for two independent reasons.

A SAML app needs **no client secret** — the trust is the signing certificate,
not a shared secret.

The app publishes its own SP metadata, so rather than transcribing values by
hand, upload **`https://<your-app>/api/saml/metadata`**. That is the step in
SAML setup that most often gets typed wrong and surfaces as an opaque failure
hours later. If entering manually:

| Entra field | Value |
| --- | --- |
| Identifier (Entity ID) | `https://<your-app>/api/saml/metadata` |
| Reply URL (ACS) | `https://<your-app>/api/saml/acs` |
| Sign on URL | `https://<your-app>/` |
| Logout URL | `https://<your-app>/api/saml/logout` |

**Claims:** no claim configuration is needed. Entra includes
`http://schemas.microsoft.com/identity/claims/tenantid` and
`.../objectidentifier` in every SAML assertion automatically, along with the
default `name`, `emailaddress`, `givenname` and `surname` claims — which is
everything the access rules and the session need. (`displayname` is *not* a
default SAML claim; the app falls back to given name + surname, then to the
UPN, so there is nothing to add.)

**Name ID format:** leave it alone. The app requests no `NameIDPolicy`, so
Entra issues whatever the application is configured for and the app accepts it
— identity comes from the UPN claim, not from NameID. Set `SAML_NAMEID_FORMAT`
only if IT requires a specific format.

Then set the variables from [`.env.example`](.env.example): `SAML_ENTRY_POINT`,
`SAML_LOGOUT_URL`, `SAML_IDP_ISSUER` and `SAML_IDP_CERT` come from the "Set up"
panel and the federation metadata; `PARKHILL_TENANT_ID` is the directory id;
`APP_BASE_URL` must match the URLs registered above exactly.

`SESSION_SECRET` is the one real secret in the application. Generate it with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Store it as an App Service application setting or in Key Vault. Changing it
signs everyone out.

### Tightening access to a security group

If access should be limited to a named group rather than to all staff, add the
`groups` claim to the SAML token configuration in Entra and extend
`authorizeProfile` in `src/lib/auth/authorize.ts` to require the group id.
Access is then managed in Entra rather than in code.

### Locally

Local sign-in needs an Entra application whose reply URL points at
`http://localhost:3000/api/saml/acs`. The usual arrangement is a second,
non-production enterprise application for development. Note that the session
cookie is only marked `Secure` in production, so plain HTTP works in dev.

---

## Design and branding

The interface is a white document on white chrome, with a single red accent,
thin grey rules, and near-black text — a professional engineering tool, not a
generic web application. It is deliberately light-mode only.

### Replacing the logo

Replace [`public/parkhill-logo.svg`](public/parkhill-logo.svg) with the
official asset, keeping the file name. Both the application header and the
report reference that one path and size it by height with automatic width, so
any aspect ratio works. If the official asset is a PNG, add it as
`parkhill-logo.png` and update the single `LOGO_SRC` constant in
`src/components/AppHeader.tsx`.

### Replacing the brand red

The red currently in the theme is a **placeholder**. Edit the `brand` colour
scale in [`src/theme/index.ts`](src/theme/index.ts) — it is the only place in
the repository where a brand colour is written, and everything else refers to
it through tokens.

### Mobile behaviour

The phone experience is intentional rather than a shrunken desktop page:

- Layouts use `100dvh`, so the iOS keyboard shrinking the viewport does not
  clip content.
- Form controls are pinned to a 16px minimum on small screens. Below that, iOS
  Safari force-zooms the viewport on focus and never zooms back out.
- Step navigation buttons sit inline at the end of the content, never in a
  fixed bottom bar — a fixed bar sits underneath the keyboard, covering the
  field being typed into.
- Causes and corrective actions are selected with full-width cards, so the tap
  target is the whole row rather than a 16px checkbox.
- Pinch-zoom is left enabled; engineers use it on field photos.

### Printing

The report carries a print stylesheet, so **Print → Save as PDF** produces a
usable document today. Application chrome is stripped, page margins are set,
and photos and observation blocks are kept from splitting across pages. Proper
server-side PDF generation is a follow-up, not a prerequisite.

---

## Known follow-ups

Deliberately not in this build:

- **PDF export.** Browser Print-to-PDF works now; server-side generation would
  give consistent output and a filename convention.
- **Deleting a saved observation.** Records can be created and edited, but
  not deleted. Edits are last-write-wins: two people saving the same
  observation at once will overwrite each other.
- **Orphaned blob cleanup.** Photos upload as soon as they are chosen, so
  abandoning a draft leaves unreferenced blobs. They are neatly foldered by
  project and observation, so a scheduled job can reconcile them against the
  `observations` container.

Operational, worth putting in a calendar:

- **The Entra signing certificate expires.** Entra issues SAML signing
  certificates with a three-year life and will email the notification address
  on the enterprise application before expiry. When it rolls, update
  `SAML_IDP_CERT`. If it lapses, every sign-in fails at once with "The sign-in
  response could not be verified" — this is the standing maintenance cost of
  SAML rather than OIDC, where key rollover is automatic.
- **Access is currently "any non-guest Parkhill account".** If it should be a
  named group instead, see
  [Tightening access to a security group](#tightening-access-to-a-security-group).

Toolchain notes:

- **Turbopack is disabled.** `dev` and `build` pass `--webpack`, because
  Chakra UI's own Next.js guide reports that Turbopack hydrates Emotion CSS
  incorrectly. Drop the flags once that guidance changes.
- **Chakra UI is pinned to 3.37.0**, which contains a known SSR bug (chakra-ui
  issue #10952) where identical styles can be assigned two different class
  names, producing occasional class-name-only hydration warnings. The fix
  merged shortly after 3.37.0 was published; move to the next release when it
  is available.
- **TypeScript is pinned to ~5.9.** TypeScript 7 (the native compiler) is
  available and is a straightforward upgrade to evaluate later; 5.9 was chosen
  for maximum compatibility with the surrounding tooling.
