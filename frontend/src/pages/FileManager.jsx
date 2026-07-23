import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Folder, File, FileText, Image as ImageIcon, Archive, 
  MoreVertical, Download, Edit, Trash2, Copy, ArrowRight,
  Plus, Upload, RefreshCw, X, Save, Lock, FolderPlus, FilePlus, ChevronRight, Menu
} from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';

export default function FileManager({ togglePanel }) {
  const { showAlert, showConfirm } = useDialog();
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [editorFile, setEditorFile] = useState(null); // { path, name, content }
  const [viewerFile, setViewerFile] = useState(null); // { path, name, type }
  const [activeMenu, setActiveMenu] = useState(null); // path of file whose menu is open

  const fileInputRef = useRef(null);

  const fetchFiles = async (path = currentPath) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/files/list?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(res.data.files);
      setCurrentPath(res.data.path);
      setParentPath(res.data.parent);
    } catch (err) {
      console.error(err);
      showAlert('Errore', 'Impossibile caricare i file: ' + (err.response?.data?.error || err.message), true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // --- Helpers ---
  const getFileIcon = (file) => {
    if (file.isDir) return <Folder size={24} color="#3b82f6" />;
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return <ImageIcon size={24} color="#10b981" />;
    if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return <Archive size={24} color="#f59e0b" />;
    if (['txt', 'md', 'js', 'json', 'yml', 'yaml', 'css', 'html'].includes(ext)) return <FileText size={24} color="#8b5cf6" />;
    return <File size={24} color="#6b7280" />;
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // --- Actions ---
  const handleItemClick = (file) => {
    if (file.isDir) {
      fetchFiles(file.path);
    } else {
      const ext = file.name.split('.').pop().toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
        openViewer(file);
      } else if (['txt', 'md', 'js', 'json', 'yml', 'yaml', 'css', 'html', 'log', 'env'].includes(ext)) {
        openEditor(file);
      } else {
        downloadFile(file);
      }
    }
  };

  const openEditor = async (file) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/files/read?path=${encodeURIComponent(file.path)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let content = res.data;
      if (typeof content === 'object') content = JSON.stringify(content, null, 2);
      setEditorFile({ path: file.path, name: file.name, content: String(content) });
    } catch (err) {
      showAlert('Errore', 'Impossibile leggere il file: ' + err.message, true);
    }
  };

  const saveEditor = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/files/write', {
        path: editorFile.path,
        content: editorFile.content
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showAlert('Salvato', 'File salvato con successo.');
      setEditorFile(null);
    } catch (err) {
      showAlert('Errore', 'Impossibile salvare il file: ' + err.message, true);
    }
  };

  const openViewer = (file) => {
    const token = localStorage.getItem('token');
    const url = `/api/files/read?path=${encodeURIComponent(file.path)}&token=${token}`;
    setViewerFile({ ...file, url });
  };

  const downloadFile = (file) => {
    const token = localStorage.getItem('token');
    const url = `/api/files/read?path=${encodeURIComponent(file.path)}`;
    
    // Create an invisible anchor to trigger download with header
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch(err => showAlert('Errore', 'Impossibile scaricare: ' + err.message, true));
  };

  const deleteFile = async (file) => {
    const confirmed = await showConfirm('Elimina', `Sei sicuro di voler eliminare ${file.isDir ? 'la cartella' : 'il file'} "${file.name}"?`);
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/files/delete', { path: file.path }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchFiles();
    } catch (err) {
      showAlert('Errore', 'Impossibile eliminare: ' + err.message, true);
    }
  };

  const createItem = async (isDir) => {
    const name = prompt(`Inserisci il nome del nuovo ${isDir ? 'folder' : 'file'}:`);
    if (!name) return;
    try {
      const token = localStorage.getItem('token');
      // basic path join
      const sep = currentPath.includes('\\') ? '\\' : '/';
      const newPath = currentPath + (currentPath.endsWith(sep) ? '' : sep) + name;
      
      await axios.post('/api/files/create', { path: newPath, isDir }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchFiles();
    } catch (err) {
      showAlert('Errore', 'Impossibile creare: ' + err.message, true);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/files/upload?path=${encodeURIComponent(currentPath)}`, formData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      fetchFiles();
    } catch (err) {
      showAlert('Errore', 'Upload fallito: ' + err.message, true);
    }
    e.target.value = ''; // reset
  };

  // --- Render ---
  
  const breadcrumbs = currentPath.split(/[/\\]/).filter(Boolean);

  return (
    <div className="flex-col h-full gap-4">
      
      {/* Header & Toolbar */}
      <div className="page-header" style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'var(--bg-color)',
        padding: '0 0 0 0',
        margin: '0 0 20px 0',
        borderBottom: '1px solid transparent',
        boxShadow: '0 4px 20px -10px var(--bg-color)'
      }}>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => togglePanel('menu')} 
            className="btn-icon-only" 
            title="Menu"
          >
            <Menu size={24} />
          </button>
        </div>

        <div className="flex items-center flex-1 gap-2 min-w-0 justify-start" style={{ paddingLeft: '10px' }}>
          <button 
            className="btn-icon flex-shrink-0" 
            onClick={() => fetchFiles(parentPath)} 
            disabled={!parentPath}
            style={{ opacity: parentPath ? 1 : 0.5, border: 'none', background: 'transparent' }}
          >
            <ChevronRight style={{ transform: 'rotate(180deg)' }} />
          </button>
          
          <div className="flex items-center gap-1 font-semibold min-w-0" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Folder size={20} color="var(--primary)" className="flex-shrink-0" style={{ marginRight: '5px' }} />
            {breadcrumbs.length === 0 ? '/' : breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span style={{ opacity: 0.5, margin: '0 4px' }}>/</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumb}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="btn-icon-only flex-shrink-0" onClick={fetchFiles} title="Aggiorna">
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
          <button className="btn-icon-only flex-shrink-0" onClick={() => createItem(true)} title="Nuova Cartella">
            <FolderPlus size={18} />
          </button>
          <button className="btn-icon-only flex-shrink-0" onClick={() => createItem(false)} title="Nuovo File">
            <FilePlus size={18} />
          </button>
          <button className="btn btn-primary flex-shrink-0" style={{ whiteSpace: 'nowrap' }} onClick={handleUploadClick}>
            <Upload size={18} style={{ marginRight: '5px' }} /> Upload
          </button>
          <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
        </div>
      </div>

      {/* Main File Area */}
      <div className="widget flex-1" style={{ overflowY: 'auto', padding: '0' }} onClick={() => setActiveMenu(null)}>
        {loading && files.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', opacity: 0.7 }}>Caricamento...</div>
        ) : (
          <div className="table-responsive-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.05)' }}>
                  <th style={{ padding: '12px 20px', width: '50%' }}>Nome</th>
                  <th style={{ padding: '12px 20px' }}>Dimensione</th>
                  <th style={{ padding: '12px 20px' }}>Ultima Modifica</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>Cartella vuota</td>
                  </tr>
                )}
                {files.map((file) => (
                  <tr key={file.path} style={{ borderBottom: '1px solid var(--card-border)', transition: 'background 0.2s' }} className="file-row">
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => handleItemClick(file)}>
                        {getFileIcon(file)}
                        <span style={{ fontWeight: file.isDir ? '600' : 'normal' }}>{file.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', opacity: 0.7 }}>
                      {file.isDir ? '--' : formatSize(file.size)}
                    </td>
                    <td style={{ padding: '12px 20px', opacity: 0.7 }}>
                      {new Date(file.modifiedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', position: 'relative' }}>
                      <button 
                        className="btn-icon" 
                        onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === file.path ? null : file.path); }}
                      >
                        <MoreVertical size={18} />
                      </button>
                      
                      {/* Context Menu Dropdown */}
                      {activeMenu === file.path && (
                        <div className="flex-col" style={{ 
                          position: 'absolute', right: '40px', top: '20px', zIndex: 10, 
                          padding: 'var(--space-1)', borderRadius: 'var(--radius-sm)',
                          boxShadow: 'var(--shadow-lg)', minWidth: '150px',
                          background: 'var(--card-bg)', border: '1px solid var(--border)'
                        }}>
                          {!file.isDir && (
                            <button className="menu-item" onClick={(e) => { e.stopPropagation(); downloadFile(file); setActiveMenu(null); }}>
                              <Download size={14} /> Scarica
                            </button>
                          )}
                          {!file.isDir && (
                            <button className="menu-item" onClick={(e) => { e.stopPropagation(); openEditor(file); setActiveMenu(null); }}>
                              <Edit size={14} /> Modifica
                            </button>
                          )}
                          <button className="menu-item danger" onClick={(e) => { e.stopPropagation(); deleteFile(file); setActiveMenu(null); }}>
                            <Trash2 size={14} /> Elimina
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Modals --- */}
      
      {/* Text Editor Modal */}
      {editorFile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="widget" style={{ width: '100%', maxWidth: '1000px', height: '100%', maxHeight: '800px', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Edit size={20} /> Modifica: {editorFile.name}</h3>
              <button className="btn-icon" onClick={() => setEditorFile(null)}><X size={24} /></button>
            </div>
            <div style={{ flex: 1, padding: '10px' }}>
              <textarea 
                value={editorFile.content}
                onChange={(e) => setEditorFile({ ...editorFile, content: e.target.value })}
                style={{ 
                  width: '100%', height: '100%', resize: 'none', background: '#1e1e1e', color: '#d4d4d4', 
                  fontFamily: 'monospace', fontSize: '14px', padding: '15px', border: 'none', borderRadius: '8px', outline: 'none' 
                }}
              />
            </div>
            <div className="modal-footer" style={{ padding: '15px 20px', borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn" style={{ background: 'var(--card-bg)' }} onClick={() => setEditorFile(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={saveEditor}>
                <Save size={16} /> Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewerFile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <button className="btn-icon" onClick={() => setViewerFile(null)} style={{ position: 'absolute', top: '20px', right: '20px', color: 'white' }}>
            <X size={32} />
          </button>
          <img src={viewerFile.url} alt={viewerFile.name} style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
          <div style={{ color: 'white', marginTop: '15px', fontSize: '1.2rem', fontWeight: '500' }}>{viewerFile.name}</div>
        </div>
      )}

    </div>
  );
}
