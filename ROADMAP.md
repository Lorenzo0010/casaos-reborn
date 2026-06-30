# Mega-Aggiornamento: File Manager, Glassmorphism e Host Control

This document outlines the steps to build and integrate three major features into CasaOS-Reborn:
1. **Web File Manager**: Browse, manage, upload, and download files stored in `/home/orangepi`.
2. **Glassmorphism UI**: Apply modern frosted-glass effects to all cards and modals.
3. **Host Control**: Reboot and Shutdown the Orange Pi directly from the Web UI.

## User Review Required

> [!WARNING]
> **Docker Volume Modification**
> - To allow file access, we must mount your host folder (`/home/orangepi`) into the container (as `/storage`).
> - To allow Server Reboot/Shutdown, we must mount the DBus socket (`/var/run/dbus/system_bus_socket`).

> [!IMPORTANT]
> **Server Deployment**
> Since these features require new Docker volumes and new backend dependencies (`multer`), it will require a complete `docker build`, `docker push`, and `docker compose up -d` cycle to take effect on the Orange Pi.

## Open Questions

Nessuna al momento. Procederò ad implementare un'interfaccia intuitiva in puro stile CasaOS!

## Proposed Changes

---

### Backend System

#### [MODIFY] [package.json](file:///c:/Users/loren/Documents/GitHub/myos/backend/package.json)
- Add `multer` to `dependencies` to handle multipart/form-data for file uploads.

#### [NEW] [files.js](file:///c:/Users/loren/Documents/GitHub/myos/backend/routes/files.js)
- Create a new Express router for file operations:
  - `GET /` - List directory contents (stat files for size/date).
  - `GET /download` - Stream file download.
  - `POST /upload` - Handle file upload to a target directory via multer.
  - `POST /folder` - Create a new directory.
  - `PUT /rename` - Rename a file or directory.
  - `DELETE /` - Delete a file or directory recursively.
- Security: Sanitize all paths to ensure they stay within the `/storage` root directory to prevent directory traversal attacks.

#### [MODIFY] [server.js](file:///c:/Users/loren/Documents/GitHub/myos/backend/server.js)
- Mount the new `routes/files.js` under the `/api/files` endpoint, protected by `authenticateToken`.

#### [MODIFY] [system.js](file:///c:/Users/loren/Documents/GitHub/myos/backend/routes/system.js)
- Add `POST /reboot` endpoint which executes the DBus reboot command: `dbus-send --system --print-reply --dest=org.freedesktop.login1 /org/freedesktop/login1 "org.freedesktop.login1.Manager.Reboot" boolean:true`
- Add `POST /shutdown` endpoint using `org.freedesktop.login1.Manager.PowerOff`

---

### Frontend System

#### [NEW] [FileManager.jsx](file:///c:/Users/loren/Documents/GitHub/myos/frontend/src/pages/FileManager.jsx)
- Build the main React page for the File Manager.
- Features:
  - Breadcrumb navigation to traverse folders.
  - File/Folder list with icons (`lucide-react`), sizes, and modification dates.
  - Action menu for each item (Download, Rename, Delete).
  - Floating Action Button or toolbar for "Upload File" and "New Folder".

#### [MODIFY] [App.jsx](file:///c:/Users/loren/Documents/GitHub/myos/frontend/src/App.jsx)
- Import `FileManager`.
- Add `<Route path="/files" element={<FileManager />} />` to the React Router.

#### [MODIFY] [Sidebar.jsx](file:///c:/Users/loren/Documents/GitHub/myos/frontend/src/components/Sidebar.jsx)
- Add a new navigation link icon (e.g., `Folder`) pointing to `/files`.
- Add a "Power" button at the bottom of the sidebar to trigger Reboot/Shutdown (with a confirmation dialog).

#### [MODIFY] [index.css](file:///c:/Users/loren/Documents/GitHub/myos/frontend/src/index.css)
- Implement Glassmorphism by adding `backdrop-filter: blur(12px)` and `-webkit-backdrop-filter: blur(12px)` to `.card`, `.glass`, and `.modal-content`.
- Adjust borders to be slightly translucent (e.g., `border: 1px solid rgba(255, 255, 255, 0.1)`) to enhance the frosted glass effect.

---

### Docker Configuration

#### [MODIFY] [docker-compose.yml](file:///c:/Users/loren/Documents/GitHub/myos/docker-compose.yml)
- Add volume mapping: `- /home/orangepi:/storage` (For File Manager)
- Add volume mapping: `- /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket` (For Host Control)

## Verification Plan

### Automated Tests
- Nessun test automatico configurato, la verifica sarà manuale.

### Manual Verification
1. Verificare che l'icona del File Manager appaia nella Sidebar.
2. Navigare in `/files` e verificare che venga mostrato il contenuto di base.
3. Testare la creazione di una nuova cartella.
4. Testare l'upload di un file di prova.
5. Testare il download e l'eliminazione.
6. Effettuare la build per l'Orange Pi e testare che la mappatura del volume `/home/orangepi` funzioni correttamente nell'ambiente reale.
