import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const [homedir, setHomedir] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [editorFile, setEditorFile] = useState(null); // { path, name, content, originalContent }
  const [viewerFile, setViewerFile] = useState(null); // { path, name, type }
  const [activeMenu, setActiveMenu] = useState(null); // path of file whose menu is open
  const [renameFile, setRenameFile] = useState(null); // { path, oldName }
  const [newName, setNewName] = useState('');
  const [createModal, setCreateModal] = useState(null); // { isDir: boolean }
  const [newItemName, setNewItemName] = useState('');
  const [clipboard, setClipboard] = useState(null); // { action, files: [] }
  const [selectedFiles, setSelectedFiles] = useState(new Set()); // Set of paths

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
      if (res.data.homedir) {
        setHomedir(res.data.homedir);
      }
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Failed to load files: ' + (err.response?.data?.error || err.message), true);
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
        showAlert('Unsupported', 'Preview not available for this file type. Please use the menu to download it.', true);
      }
    }
  };

  const openEditor = async (file) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/files/read?path=${encodeURIComponent(file.path)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let content = res.data;
      if (typeof content === 'object') content = JSON.stringify(content, null, 2);
      setEditorFile({ path: file.path, name: file.name, content: String(content), originalContent: String(content) });
    } catch (err) {
      showAlert('Error', 'Failed to read file: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const closeEditor = () => {
    if (editorFile && editorFile.content !== editorFile.originalContent) {
      showConfirm('Unsaved changes', 'You have unsaved changes. Are you sure you want to exit?').then(confirmed => {
        if (confirmed) setEditorFile(null);
      });
    } else {
      setEditorFile(null);
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
      showAlert('Saved', 'File saved successfully.');
      setEditorFile({ ...editorFile, originalContent: editorFile.content });
    } catch (err) {
      showAlert('Error', 'Failed to save file: ' + err.message, true);
    }
  };

  const openViewer = (file) => {
    const token = localStorage.getItem('token');
    const url = `/api/files/read?path=${encodeURIComponent(file.path)}&token=${token}`;
    setViewerFile({ ...file, url });
  };

  const processDownload = async (filesList) => {
    if (filesList.length === 0) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const items = filesList.map(f => f.path);
      
      const sizeRes = await axios.post('/api/files/size', { items }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const totalSize = sizeRes.data.size;
      
      if (totalSize > 1024 * 1024 * 1024) {
        const confirmed = await showConfirm('Large Download', `The selected items are larger than 1GB (${formatSize(totalSize)}). Compressing and downloading might take a long time. Do you want to proceed?`);
        if (!confirmed) {
          setLoading(false);
          return;
        }
      }

      if (filesList.length === 1 && !filesList[0].isDir) {
         const url = `/api/files/read?path=${encodeURIComponent(filesList[0].path)}&token=${token}`;
         const a = document.createElement('a');
         a.href = url;
         a.download = filesList[0].name;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         setLoading(false);
         return;
      }

      const archiveName = filesList.length === 1 ? `${filesList[0].name}.zip` : 'CasaOS_Export.zip';
      
      const res = await axios.post('/api/files/archive', {
        items,
        destination: currentPath,
        archiveName
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        const sep = currentPath.includes('\\') ? '\\' : '/';
        const zipPath = currentPath + (currentPath.endsWith(sep) ? '' : sep) + archiveName;
        const url = `/api/files/download-temp?path=${encodeURIComponent(zipPath)}&token=${token}`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = archiveName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showAlert('Success', `Download for ${archiveName} started. The compressed archive will be automatically deleted from the server when finished.`);
        setTimeout(fetchFiles, 2000);
      }
    } catch (err) {
      showAlert('Error', 'Failed to process download: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (file) => {
    processDownload([file]);
  };

  const deleteFile = async (file) => {
    const confirmed = await showConfirm('Delete', `Are you sure you want to delete ${file.isDir ? 'the folder' : 'the file'} "${file.name}"?`);
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/files/delete', { path: file.path }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchFiles();
      selectedFiles.delete(file.path);
      setSelectedFiles(new Set(selectedFiles));
    } catch (err) {
      showAlert('Error', 'Failed to delete: ' + err.message, true);
    }
  };

  const toggleSelection = (file, e) => {
    e.stopPropagation();
    const newSet = new Set(selectedFiles);
    if (newSet.has(file.path)) newSet.delete(file.path);
    else newSet.add(file.path);
    setSelectedFiles(newSet);
  };

  const bulkDelete = async () => {
    const confirmed = await showConfirm('Delete Multiple', `Are you sure you want to delete ${selectedFiles.size} items?`);
    if (!confirmed) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const paths = Array.from(selectedFiles);
      await Promise.all(paths.map(p => 
        axios.post('/api/files/delete', { path: p }, { headers: { Authorization: `Bearer ${token}` } })
      ));
      setSelectedFiles(new Set());
      fetchFiles();
    } catch (err) {
      showAlert('Error', 'Failed to delete some items: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const bulkDownload = () => {
    const selectedFilesList = files.filter(f => selectedFiles.has(f.path));
    if (selectedFilesList.length === 0) {
      showAlert('Error', 'No files selected for download.', true);
      return;
    }
    processDownload(selectedFilesList);
  };

  const handleRename = async () => {
    if (!newName) return;
    try {
      const token = localStorage.getItem('token');
      const sep = currentPath.includes('\\') ? '\\' : '/';
      const newPath = currentPath + (currentPath.endsWith(sep) ? '' : sep) + newName;

      await axios.post('/api/files/rename', { oldPath: renameFile.path, newPath }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRenameFile(null);
      setNewName('');
      fetchFiles();
    } catch (err) {
      showAlert('Error', 'Failed to rename: ' + err.message, true);
    }
  };

  const copyToClipboard = (fileOrFiles, action) => {
    const filesArray = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    setClipboard({ action, files: filesArray });
    setSelectedFiles(new Set()); // clear selection after copy/move click
  };

  const pasteClipboard = async () => {
    if (!clipboard || !clipboard.files.length) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const sep = currentPath.includes('\\') ? '\\' : '/';
      const endpoint = clipboard.action === 'copy' ? '/api/files/copy' : '/api/files/move';
      
      await Promise.all(clipboard.files.map(async (f) => {
        const destPath = currentPath + (currentPath.endsWith(sep) ? '' : sep) + f.name;
        await axios.post(endpoint, { source: f.path, dest: destPath }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }));
      
      setClipboard(null);
      fetchFiles();
    } catch (err) {
      showAlert('Error', 'Failed to paste some items: ' + (err.response?.data?.error || err.message), true);
    } finally {
      setLoading(false);
    }
  };

  const createItem = (isDir) => {
    setCreateModal({ isDir });
    setNewItemName('');
  };

  const handleCreateSubmit = async () => {
    if (!newItemName) return;
    try {
      const token = localStorage.getItem('token');
      const sep = currentPath.includes('\\') ? '\\' : '/';
      const newPath = currentPath + (currentPath.endsWith(sep) ? '' : sep) + newItemName;
      
      await axios.post('/api/files/create', { path: newPath, isDir: createModal.isDir }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCreateModal(null);
      setNewItemName('');
      fetchFiles();
    } catch (err) {
      showAlert('Error', 'Failed to create: ' + err.message, true);
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
      showAlert('Error', 'Upload failed: ' + err.message, true);
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
        {selectedFiles.size > 0 ? (
          <div className="flex items-center w-full justify-between" style={{ padding: '0 10px' }}>
            <div className="flex items-center gap-4">
              <button className="btn-icon-only flex-shrink-0" onClick={() => setSelectedFiles(new Set())} title="Clear Selection">
                <X size={20} />
              </button>
              <span style={{ fontWeight: '600', fontSize: '1.1rem' }}>{selectedFiles.size} selected</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button className="btn btn-sm" onClick={bulkDownload}><Download size={16} style={{ marginRight: '5px' }} /> Download</button>
              <button className="btn btn-sm" onClick={() => copyToClipboard(files.filter(f => selectedFiles.has(f.path)), 'copy')}><Copy size={16} style={{ marginRight: '5px' }} /> Copy</button>
              <button className="btn btn-sm" onClick={() => copyToClipboard(files.filter(f => selectedFiles.has(f.path)), 'move')}><ArrowRight size={16} style={{ marginRight: '5px' }} /> Move</button>
              <button className="btn btn-sm danger" onClick={bulkDelete}><Trash2 size={16} style={{ marginRight: '5px' }} /> Delete</button>
            </div>
          </div>
        ) : (
          <>
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
              <button className="btn-icon-only flex-shrink-0" onClick={() => fetchFiles()} title="Refresh">
                <RefreshCw size={18} className={loading ? 'spin' : ''} />
              </button>
              <button className="btn-icon-only flex-shrink-0" onClick={() => createItem(true)} title="New Folder">
                <FolderPlus size={18} />
              </button>
              <button className="btn-icon-only flex-shrink-0" onClick={() => createItem(false)} title="New File">
                <FilePlus size={18} />
              </button>
              <button className="btn btn-primary flex-shrink-0" style={{ whiteSpace: 'nowrap' }} onClick={handleUploadClick}>
                <Upload size={18} style={{ marginRight: '5px' }} /> Upload
              </button>
              <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            </div>
          </>
        )}
      </div>

      {/* Shortcuts Row */}
      <div className="flex items-center gap-2" style={{ padding: '0 0 10px 0', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {(currentPath.includes('\\') || /^[A-Za-z]:/.test(currentPath) ? [
          { name: 'System (C:)', path: 'C:\\', icon: <Archive size={14} /> },
          { name: 'Home', path: '~', icon: <Folder size={14} /> },
        ] : [
          { name: 'Root', path: '/', icon: <Archive size={14} /> },
          { name: 'Home', path: '~', icon: <Folder size={14} /> },
          { name: 'Media', path: '/media', icon: <ImageIcon size={14} /> },
          { name: 'Mounts', path: '/mnt', icon: <File size={14} /> },
        ]).map(s => (
          <button 
            key={s.path}
            className="btn btn-sm flex-shrink-0" 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => fetchFiles(s.path)}
          >
            {s.icon} {s.name}
          </button>
        ))}
      </div>

      {/* Main File Area */}
      <div className="widget flex-1" style={{ overflowY: 'auto', padding: '0' }} onClick={() => setActiveMenu(null)}>
        {loading && files.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', opacity: 0.7 }}>Loading...</div>
        ) : (
          <div className="table-responsive-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.05)' }}>
                  <th style={{ padding: '12px 20px', width: '40px' }}>
                    <input type="checkbox" className="themed-checkbox" onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFiles(new Set(files.map(f => f.path)));
                      } else {
                        setSelectedFiles(new Set());
                      }
                    }} checked={files.length > 0 && selectedFiles.size === files.length} />
                  </th>
                  <th style={{ padding: '12px 20px', width: '50%' }}>Name</th>
                  <th style={{ padding: '12px 20px' }}>Size</th>
                  <th style={{ padding: '12px 20px' }}>Last Modified</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>Folder is empty</td>
                  </tr>
                )}
                {files.map((file) => (
                  <tr key={file.path} style={{ borderBottom: '1px solid var(--card-border)', transition: 'background 0.2s', backgroundColor: selectedFiles.has(file.path) ? 'rgba(59, 130, 246, 0.1)' : 'transparent' }} className="file-row">
                    <td style={{ padding: '12px 20px' }} onClick={(e) => toggleSelection(file, e)}>
                      <input type="checkbox" className="themed-checkbox" checked={selectedFiles.has(file.path)} onChange={(e) => toggleSelection(file, e)} />
                    </td>
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
                          <button className="menu-item" onClick={(e) => { e.stopPropagation(); downloadFile(file); setActiveMenu(null); }}>
                            <Download size={14} /> Download
                          </button>
                          {!file.isDir && (
                            <button className="menu-item" onClick={(e) => { e.stopPropagation(); openEditor(file); setActiveMenu(null); }}>
                              <Edit size={14} /> Edit
                            </button>
                          )}
                          <button className="menu-item" onClick={(e) => { e.stopPropagation(); setRenameFile({ path: file.path, oldName: file.name }); setNewName(file.name); setActiveMenu(null); }}>
                            <Edit size={14} /> Rename
                          </button>
                          <button className="menu-item" onClick={(e) => { e.stopPropagation(); copyToClipboard(file, 'copy'); setActiveMenu(null); }}>
                            <Copy size={14} /> Copy
                          </button>
                          <button className="menu-item" onClick={(e) => { e.stopPropagation(); copyToClipboard(file, 'move'); setActiveMenu(null); }}>
                            <ArrowRight size={14} /> Move
                          </button>
                          <button className="menu-item danger" onClick={(e) => { e.stopPropagation(); deleteFile(file); setActiveMenu(null); }}>
                            <Trash2 size={14} /> Delete
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
      {editorFile && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="widget" style={{ width: '100%', maxWidth: '1000px', height: '100%', maxHeight: '800px', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Edit size={20} /> Editing: {editorFile.name}</h3>
              <button className="btn-icon" onClick={closeEditor}><X size={24} /></button>
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
              <button className="btn" style={{ background: 'var(--card-bg)' }} onClick={closeEditor}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEditor}>
                <Save size={16} /> Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Image Viewer Modal */}
      {viewerFile && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <button className="btn-icon" onClick={() => setViewerFile(null)} style={{ position: 'absolute', top: '20px', right: '20px', color: 'white' }}>
            <X size={32} />
          </button>
          <img src={viewerFile.url} alt={viewerFile.name} style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
          <div style={{ color: 'white', marginTop: '15px', fontSize: '1.2rem', fontWeight: '500' }}>{viewerFile.name}</div>
        </div>,
        document.body
      )}

      {/* Rename Modal */}
      {renameFile && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="widget" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ margin: 0 }}>Rename</h3>
            <input 
              type="text" 
              className="input" 
              value={newName} 
              onChange={e => setNewName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleRename()}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn" style={{ background: 'var(--card-bg)' }} onClick={() => setRenameFile(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRename}>Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Create Modal */}
      {createModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="widget" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ margin: 0 }}>{createModal.isDir ? 'New Folder' : 'New File'}</h3>
            <input 
              type="text" 
              className="input" 
              placeholder={createModal.isDir ? 'Folder name' : 'File name'}
              value={newItemName} 
              onChange={e => setNewItemName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateSubmit()}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn" style={{ background: 'var(--card-bg)' }} onClick={() => setCreateModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateSubmit}>Create</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Clipboard Bottom Bar */}
      {clipboard && (
        <div style={{ 
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', 
          backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
          borderRadius: 'var(--radius-lg)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '15px', zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {clipboard.action === 'copy' ? <Copy size={18} color="var(--primary)" /> : <ArrowRight size={18} color="var(--primary)" />}
            <span style={{ fontWeight: '500' }}>
              {clipboard.action === 'copy' ? 'Copying:' : 'Moving:'} {clipboard.files.length} item(s)
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-icon" onClick={() => setClipboard(null)}><X size={18} /></button>
            <button className="btn btn-primary" onClick={pasteClipboard}>Paste here</button>
          </div>
        </div>
      )}

    </div>
  );
}
