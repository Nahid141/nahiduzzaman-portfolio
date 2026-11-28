# MASTER DEVELOPMENT PROMPT: PRIVATE CONNECT

Act as a senior full-stack software architect, cybersecurity engineer, real-time communication specialist, DevOps engineer and advanced UI/UX designer. Design, develop, test and prepare for production deployment a secure, feature-rich, real-time private communication and collaboration platform named **Private Connect**, integrated into my existing website.

- Website: https://www.fnunahiduzzaman.com
- Target route: `/connect`
- Initial administrator username: `nahid007`
- Development branch: `feature/private-connect`

This must be a fully functional application, not a static demonstration, simulated interface or collection of placeholder components. Implement the project phase by phase, preserving all existing website functionality. Treat this document as the project specification.

## 1. Existing project inspection

- Inspect the complete existing repository, frontend, backend, dependencies, environment configuration and deployment architecture.
- Identify the existing Next.js structure, API architecture, navigation, styling and authentication mechanisms.
- Inspect installed Claude Code skills, including Superpowers, UI/UX, frontend, backend and security-related skills. Use applicable skills throughout development.
- Create a detailed implementation plan, architecture document and threat model.
- Create a dedicated Git branch named `feature/private-connect`. Preserve all existing uncommitted changes; do not reset or overwrite unrelated work.
- Do not break, replace or unnecessarily modify existing website functionality, including PRRSLooM and other research tools.
- Reuse existing compatible technologies where appropriate rather than introducing unnecessary dependencies. Verify current dependency compatibility and licenses.

## 2. Application routes

Create protected and properly structured routes:

- `/connect`
- `/connect/login`
- `/connect/admin/login`
- `/connect/member/login`
- `/connect/register`
- `/connect/forgot-password`
- `/connect/dashboard`
- `/connect/chat`
- `/connect/messages`
- `/connect/conference`
- `/connect/files`
- `/connect/music`
- `/connect/members`
- `/connect/settings`
- `/connect/admin`

Add a discreet Private Connect navigation link to the existing website. All application routes except authentication, registration and explicitly public account recovery endpoints must require valid authentication and authorization. Exclude private application pages from search engine indexing. Do not treat search engine exclusion as a security mechanism. Prevent caching of sensitive responses in shared caches.

## 3. Authentication and registration

Create a professional login gateway containing two options: **Administrator Login** and **Member Login**, plus a member registration option. Both login paths must use server-verified identities and roles, not trust a role supplied by the client.

### Administrator account

Initial administrator username: `nahid007`.

Provision the initial administrator through a secure, idempotent bootstrap script. Prompt interactively for a new administrator password using hidden terminal input, or retrieve it securely from a secret manager. Never reuse an exposed password. Never hardcode credentials into source code, frontend JavaScript, configuration templates, Docker images or Git history. Do not print or log secrets. Do not create a default administrator password.

Requirements:

- Secure password hashing using Argon2id or an equivalent established algorithm.
- Administrator two-factor authentication and securely generated recovery codes.
- Secure session management, expiration and revocation.
- HTTP-only, Secure and appropriately configured SameSite cookies.
- Login attempt rate limiting, suspicious login detection and protection against brute-force attacks and credential stuffing.
- Password change functionality and secure account recovery.
- The administrator role must never be assignable through public registration or frontend manipulation.

### Member registration

Registration fields: full name, unique username, email address, password, confirmation, optional profile picture, optional biography, and acceptance of terms and privacy policy.

Registration workflow:

1. User submits registration.
2. Email address is verified.
3. Account status becomes pending approval.
4. Administrator receives a notification.
5. Administrator approves or rejects the request.
6. Approved members gain access to the workspace.

Implement account states: pending, active, rejected, suspended and banned. Allow administrators to configure whether manual registration approval is mandatory; enable it by default. Use expiring, single-use verification and recovery tokens; store token hashes and avoid account enumeration.

## 4. Dynamic and synchronized dashboard

Develop a modern, responsive, real-time dashboard shared by all authenticated members. Synchronize shared application state through WebSockets and persistent server-side storage.

Shared components:

- Online member list and presence indicators
- General chat
- Active video conferences
- Current screen-sharing session
- Recently shared files
- Currently playing music and request queue
- Administrator announcements
- Shared activity feed
- Shared presentation area
- Room status and notifications

When a member performs an authorized action affecting shared state, updates must appear immediately for all authorized connected users without refreshing the page.

Implement automatic reconnection, state recovery, presence tracking, heartbeat monitoring, event acknowledgments, duplicate event prevention, server-authoritative state, persistent state snapshots, versioning and conflict resolution.

Add an optional administrator-controlled **Follow Host Mode**. When enabled, the administrator can synchronize the shared presentation, selected document, video or active dashboard panel across participants. Do not synchronize private messages, passwords, personal settings, local audio volume or other confidential user-specific information. Do not override accessibility settings or navigate a user away from private content without clear consent.

## 5. Live group messaging

Implement a complete real-time messaging system comparable to modern collaboration applications:

- Instant text messaging, emoji and reactions
- Reply, edit, delete and forward messages
- Username mentions and typing indicators
- Delivery and read receipts, timestamps, online/offline indicators
- Searchable message history and unread counts
- Pinned messages, file attachments and voice messages
- Link previews with SSRF protection and appropriate security controls
- New message notifications, pagination and infinite scrolling

Support a default general chat and additional administrator-created workspace-wide or restricted channels. Persist messages in the database. Only authorized participants may retrieve channel history or subscribe to channel events. Allow administrators to moderate shared channel messages.

## 6. Secure private messaging

Implement a separate direct messaging system between individual members:

- One-to-one private conversations and optional invitation-only group conversations
- Private file, image, video and audio sharing
- Read receipts, typing indicators and message search
- Conversation archiving, user blocking and notification muting
- Optional disappearing messages with clear limitations on recipient copies and backups

Private conversations must be inaccessible to other members and must not be included in shared dashboard state. The administrator must not automatically have access to the contents of private conversations through application features.

Use strong transport encryption and appropriate encryption at rest. Design and implement end-to-end encryption (E2EE) using an established, audited protocol or library, including secure key management, identity verification, device enrollment and multi-device considerations. Do not invent a custom encryption algorithm. If full E2EE cannot be implemented securely, explicitly document the limitation and do not falsely advertise the application as E2EE. Explain the distinction between server-side access controls and E2EE, including access by infrastructure operators. Explain the effects of encryption on message search, recovery, moderation, backups and multi-device synchronization. For encrypted attachments, perform appropriate client-side safety checks and document the limitations of server-side malware scanning of ciphertext.

## 7. Video conferencing

Implement an integrated video conferencing system supporting up to **10 simultaneous participants per conference**, including the administrator or host. Use LiveKit with WebRTC and an SFU-based media architecture. Do not use a peer-to-peer full-mesh architecture for the primary conferencing system.

Features:

- Create and join meetings; instant video calls and audio-only calls
- Camera on/off, microphone mute/unmute and camera switching
- Microphone and speaker selection where browser-supported
- Active speaker detection, grid view, speaker view and full-screen mode
- Picture-in-picture where supported
- Raise hand, meeting reactions and in-meeting chat
- Network quality indicators, adaptive video quality and automatic reconnection
- Background blur where supported, noise suppression and echo cancellation
- Participant invitations, waiting rooms and meeting locking

Enforce the 10-participant limit on the backend and media service, including simultaneous join attempts and abandoned reservations. The eleventh participant must receive a clear capacity notification.

### Host controls

- Start and end conferences; approve waiting participants
- Mute or remove participants; restrict screen sharing
- Lock/unlock the meeting and transfer host responsibility
- Control presentation mode

Never silently activate another user's camera or microphone. Use TURN/STUN infrastructure for users behind restrictive networks, VPNs or NAT. Evaluate LiveKit E2EE for audio/video and screen sharing, including key distribution and feature tradeoffs. Recording must be disabled by default; if implemented, require explicit consent, a visible recording indicator and configurable retention.

## 8. Screen sharing

Integrate real-time screen sharing within conferences. Support browser-authorized sharing of the entire screen, individual application window, browser tab and system or tab audio where supported.

Implement start/stop sharing, shared-screen full-screen mode, automatic presentation layout, administrator permission controls, a screen-sharing request queue, active presenter indicators, automatic cleanup when sharing ends, and simultaneous display of shared screen and participant video. Allow only one active primary presenter by default. Support configurable multi-presenter functionality if appropriate. Respect browser and operating system permission restrictions.

## 9. File and content sharing

Allow users to upload and share PDF, Word, Excel, PowerPoint, images, audio, video, text documents and approved compressed archives.

Implement:

- Drag-and-drop and multiple file uploads; upload progress and downloads
- PDF viewer, image gallery, audio player, video player and thumbnails
- File search, categories, ownership, shared folders and expiration
- Storage usage monitoring, quotas and configurable file size limits

Suggested initial upload limits: images 25 MB; documents 100 MB; audio 100 MB; videos 500 MB. These are configurable defaults, not guarantees.

Use private Google Cloud Storage buckets or a compatible private object storage service. Large files should upload directly to object storage through authorized, short-lived upload credentials rather than passing through Next.js. Implement resumable uploads where supported.

Validate extensions, MIME types and file signatures; verify uploaded objects server-side before publication. Add malware scanning, upload quarantine, storage quotas and protection against malicious archives. Never expose private files through permanent public URLs. Verify access authorization before issuing short-lived download URLs. Use safe document rendering and prevent execution of uploaded HTML, scripts or other active content. Clean up abandoned uploads and enforce retention and deletion policies.

## 10. Synchronized music lounge

Create a real-time shared music lounge where every participating member can listen to the same approved music simultaneously.

### Music request workflow

1. A member uploads or selects an authorized audio file.
2. The member submits a playback request.
3. The administrator receives a real-time notification.
4. The administrator approves, rejects or queues the request.
5. Approved music starts at a server-authorized time.
6. Connected, audio-enabled members begin playback at the corresponding position.
7. Members joining later synchronize with the current playback position.

### Music player features

- Play/pause, next/previous track, seek, repeat and shuffle
- Music request queue, album artwork, track duration and progress
- Recently played tracks; lyrics support when authorized
- Individual volume and mute controls; optional synchronized listening mode

The administrator controls global playback, including playing, pausing, skipping, seeking, approving tracks and removing tracks from the queue. Allow temporary DJ permissions to selected members, with expiration and revocation.

### Playback synchronization

Implement a server-authoritative playback state containing track ID, playback status, server start timestamp, playback offset, current playback position reference, queue state, controller ID and state version. Use synchronized server timestamps, client clock-offset estimation, latency compensation, buffered playback and periodic drift correction. Target a playback difference of less than 250 milliseconds under normal network conditions after buffering; measure actual synchronization accuracy and do not guarantee exact synchronization across all devices.

Handle network interruptions, buffering, late joining and reconnection. Respect browser autoplay restrictions; provide a clear **Enable Audio** button that initializes playback following user interaction. Music and meeting audio must have independent volume controls. Implement optional music ducking when a participant speaks during a conference. Only support media that users have permission to share and stream. Do not bypass DRM or third-party streaming service restrictions.

## 11. Synchronized multimedia presentation

Extend shared playback functionality beyond music. Allow authorized members to request synchronized video playback, PDF presentation, image slideshow, shared document presentation and a collaborative whiteboard.

The administrator or designated presenter can control play/pause, video position, PDF page number, slide changes, presentation start/stop, shared pointer location and annotations. Participating viewers must receive the same presentation state in real time. Provide an option to leave the synchronized presentation and continue independent viewing when permitted. Ensure document access remains permission-scoped.

## 12. Administrator control center

Build a dedicated administrative dashboard.

### User management

- Total registered members; active/online members; pending registrations
- Approve/reject, suspend, ban and reactivate accounts
- Manage roles and permissions; force session revocation
- View registration dates and permitted activity metadata

### Content management

- Manage public channels, moderate shared content and manage shared files
- Set storage quotas, manage music requests and active presentations
- Publish announcements

### Conference management

- Monitor active conference status and participant counts
- Manage meeting permissions and conferencing limits
- End active conferences and configure waiting rooms

### System monitoring

- WebSocket connections, database status and server uptime
- CPU/RAM utilization, network bandwidth and storage consumption
- API error rates, conference connection quality, security events and audit logs

### Global settings

- Enable/disable registrations and maintenance mode
- Configure approval requirements, upload limits, music permissions and conference permissions
- Manage announcements and application branding
- Configure retention policies and feature flags

Verify administrator authorization on the server for every privileged operation. Administrative audit logs must not contain passwords, authentication tokens, encryption keys or private conversation contents. Prevent accidental removal of the last administrator.

## 13. Additional advanced features

Design the architecture to accommodate:

- Collaborative whiteboard, real-time polls and voting
- Scheduled meetings, shared calendar and shared notes
- Personal bookmarks, task assignments and event reminders
- Push/browser notifications and optional email notifications
- QR-code meeting invitations and expiring invitation links
- Custom user status and Do Not Disturb mode
- Dark/light themes and Progressive Web App support
- Desktop and mobile responsive layouts

Implement essential functionality first, and develop additional modules after the core system is stable. Do not cache private data in the PWA service worker without an explicit security design.

## 14. UI/UX requirements

Create a premium, modern interface combining useful design patterns from Discord, Microsoft Teams, Slack, Zoom and Spotify without directly copying their branding.

- Professional dark and light modes
- Responsive sidebar navigation, expandable/collapsible and resizable panels
- Real-time status indicators, modern typography and consistent spacing
- Smooth, restrained animations and reduced-motion support
- Skeleton loading states, accessible dialogs and professional empty states
- Error recovery interfaces, keyboard navigation and appropriate color contrast
- Mobile-friendly controls

Use a three-panel desktop layout:

- **Left:** Navigation, channels, direct messages and user profile.
- **Center:** Main dashboard, conference, screen sharing or shared presentation.
- **Right:** Live chat, online members, notifications or activity feed.
- **Bottom:** Persistent synchronized media player when media is active.

All dashboard components must react to live data. Do not create nonfunctional buttons or fabricated statistics.

## 15. Database architecture

Use PostgreSQL with Prisma ORM or an equivalent compatible database architecture. Design normalized models for:

- Users, roles, permissions, sessions and registration requests
- Email verification and password reset tokens
- Channels, channel memberships, messages, reactions and receipts
- Private conversations, conversation participants and encryption key metadata
- Attachments, shared files, meetings, meeting participants and invitations
- Music tracks, requests, playback queues and playback state
- Shared dashboard state, presentations, notifications and announcements
- User preferences, application settings, audit logs and security events

Include foreign keys, indexes, unique constraints, migrations and appropriate deletion policies. Use Redis for presence tracking, distributed rate limiting, WebSocket coordination, transient state and real-time synchronization. Keep durable data in PostgreSQL. Use database transactions and atomic operations for race-sensitive functionality such as meeting capacity and music approval.

## 16. API and real-time architecture

Create a versioned API with documented endpoints. Suggested endpoint groups:

```text
/api/v1/auth
/api/v1/users
/api/v1/admin
/api/v1/channels
/api/v1/messages
/api/v1/conversations
/api/v1/files
/api/v1/meetings
/api/v1/media
/api/v1/music
/api/v1/presentations
/api/v1/notifications
/api/v1/settings
/api/v1/health
```

Implement structured WebSocket events, including:

```text
presence:update
chat:message
chat:typing
private:message
file:shared
meeting:started
meeting:ended
meeting:participant_joined
music:requested
music:approved
music:play
music:pause
music:seek
music:sync
dashboard:update
presentation:update
admin:announcement
notification:new
```

Authenticate WebSocket connections and authorize every event individually, including reconnects and subscription requests. Validate incoming payloads and enforce message size and rate limits. Revoke subscriptions and disconnect suspended users promptly. Never broadcast private events to global channels. Generate API documentation using OpenAPI or equivalent. Keep detailed health information restricted and expose only minimal public health status if needed.

## 17. Security requirements

Follow established OWASP security recommendations:

- HTTPS and secure WebSocket connections
- Role-based and server-side object-level authorization; deny by default
- CSRF protection where applicable, XSS and SQL injection protection
- Strict input validation, Content Security Policy and security headers
- Restrictive CORS and WebSocket origin validation
- API rate limiting, secure password hashing and multi-factor authentication
- Secure session revocation, abuse prevention and file upload protection
- Malware scanning, encryption at rest and secure secret management
- Dependency vulnerability scanning, database backup and recovery
- Privacy-preserving audit logs

Use short-lived, room-specific LiveKit access tokens with restricted permissions. Never expose database credentials, JWT signing secrets, cloud credentials, storage credentials or LiveKit API secrets to the frontend. Ensure unauthorized users cannot access private conversations, files, meetings, dashboard events or administrator endpoints through direct API requests. Perform a security review before recommending production deployment. Document data retention, deletion, privacy boundaries and any residual risks. Avoid using real private data in development or testing.

## 18. Deployment architecture

Preserve the existing website deployment. Recommended architecture:

| Component | Technology |
|---|---|
| Frontend | Existing Next.js application on Vercel, TypeScript |
| UI | Tailwind CSS, shadcn/ui, Framer Motion or existing compatible design system |
| Communication backend | Isolated Node.js/NestJS or existing compatible backend on Google Cloud |
| Real-time communication | Socket.IO, WebSockets, Redis |
| Media server | Self-hosted LiveKit or LiveKit Cloud |
| Database | PostgreSQL, Prisma or compatible ORM |
| File storage | Private Google Cloud Storage |
| Authentication | Auth.js or compatible secure authentication |
| Reverse proxy | Nginx |
| Containerization | Docker and Docker Compose |
| TLS | Trusted certificate authority with automated renewal |
| Testing | Playwright, Vitest and appropriate load-testing tools |
| CI/CD | GitHub Actions |

Suggested service domains:

- `connect-api.fnunahiduzzaman.com`
- `connect-media.fnunahiduzzaman.com`

Evaluate whether the existing Google Cloud VM (previously configured with 4 vCPUs, 16 GB RAM and 200 GB disk; verify current resources) has sufficient CPU, RAM, disk capacity and network bandwidth for the application and ten-person conferences. Do not assume the existing PRRSLooM VM can safely accommodate additional workloads. Prefer an isolated media service and resource limits to protect PRRSLooM. Use dedicated service accounts and separate database credentials.

Configure LiveKit-compatible firewall rules, TURN connectivity, health checks, restart policies and backup mechanisms. Do not modify existing PRRSLooM services, ports, DNS records, firewall rules or reverse-proxy configurations without first checking for conflicts. Use exact documented ports for the chosen deployment. Provide estimated infrastructure costs including media bandwidth, object storage, database services and backups. Do not create paid resources, change production DNS/firewalls or deploy to production without explicit authorization.

## 19. Testing requirements

Write and execute meaningful unit, integration and end-to-end tests. Test:

1. Successful administrator login and MFA.
2. Invalid login attempts and rate limiting.
3. Member registration and email verification.
4. Administrator approval and rejection.
5. Unauthorized dashboard access.
6. Member attempts to access administrator endpoints.
7. Live messaging between multiple browser sessions.
8. Private message isolation, including WebSocket subscriptions and direct API access.
9. File upload, quarantine and authorized downloads.
10. Unauthorized access to private files.
11. Video conference with 10 participants.
12. Rejection of an eleventh participant, including concurrent join attempts.
13. Camera and microphone controls.
14. Screen sharing.
15. Administrator approval of music requests and rejection of unauthorized controls.
16. Music synchronization across multiple clients; measure drift.
17. Late-joining music listeners.
18. Playback pause and seek synchronization.
19. WebSocket reconnection and state recovery.
20. Shared dashboard synchronization.
21. Suspended user session revocation across API, WebSocket and media services.
22. Mobile responsiveness and accessibility.
23. Security vulnerability checks and negative authorization tests.
24. Existing website regression tests.
25. Backup restoration and rollback procedures.

Use Playwright for browser-based testing and appropriate load-testing tools for concurrent traffic. Use real browser sessions and suitable test participants to validate conferencing and media performance. Distinguish simulated network/media tests from real device tests. Do not report tests as successful unless they were actually executed successfully.

## 20. Development phases

### Phase 1: Discovery and architecture

- Repository inspection and requirements analysis
- Architecture design, database schema and threat modeling
- Dependency evaluation and development environment configuration

### Phase 2: Authentication and administration

- Administrator bootstrap, member registration and email verification
- Approval workflow, session management and role-based access control
- Administrative dashboard foundation

### Phase 3: Real-time communication

- WebSocket backend, presence tracking and general chat
- Private messaging, notifications and synchronized dashboard state

### Phase 4: File sharing

- Private object storage, upload pipeline and malware scanning
- File previews, downloads and access controls

### Phase 5: Video conferencing

- LiveKit integration, meeting management and participant authorization
- Ten-participant limit, audio/video controls and screen sharing

### Phase 6: Synchronized entertainment and presentations

- Music request system and administrator-controlled playback
- Playback synchronization, synchronized video/document presentations and shared multimedia controls

### Phase 7: Advanced functionality and UI refinement

- Whiteboard, polls, scheduling, mobile optimization, PWA support and accessibility improvements

### Phase 8: Testing and deployment preparation

- Automated testing, security review, load testing and performance optimization
- Deployment scripts, backup verification, staging deployment configuration and production deployment checklist

## 21. Required deliverables

Produce:

- Complete functional frontend and backend
- Database schema and migrations
- Secure administrator bootstrap script
- Docker configuration and Nginx configuration templates
- Environment variable example file without secrets
- Automated tests and GitHub Actions configuration
- API, architecture, security and deployment documentation
- Backup and recovery documentation, user guide and administrator guide

Maintain the following project documentation:

```text
PRIVATE_CONNECT_PLAN.md
PRIVATE_CONNECT_ARCHITECTURE.md
PRIVATE_CONNECT_PROGRESS.md
PRIVATE_CONNECT_SECURITY.md
PRIVATE_CONNECT_DEPLOYMENT.md
PRIVATE_CONNECT_TEST_REPORT.md
```

Update the progress document after every major phase. Include completed tasks, decisions, actual test results, unresolved blockers, dependencies and next steps.

## 22. Execution instructions

Do not stop after generating the development plan. After completing repository inspection and architecture planning, begin implementing the application phase by phase. Run linting, type checking, automated tests and production builds after relevant changes. Resolve implementation errors before advancing to dependent phases. Make meaningful local Git commits for each completed milestone without committing unrelated changes or secrets.

Do not merge the development branch into main, push sensitive changes, or publish it to production without approval. Do not fabricate functioning features, test results, deployment status or security guarantees. If a feature cannot be completed, document the exact blocker, remaining implementation requirements and recommended solution. Prioritize security, real-time functionality, reliability, maintainability and compatibility with the existing website.

Begin with repository inspection, architecture planning and implementation of Phase 1. Continue through subsequent phases as feasible, maintaining a resumable progress document so future Claude Code sessions can continue from the last verified checkpoint.
