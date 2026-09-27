import { useEffect, useRef, useState } from 'react';

const API_URL = 'http://localhost:4000';

function Resumes() {
  const [resumes, setResumes] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [banner, setBanner] = useState(null);
  const fileInput = useRef(null);
  const token = localStorage.getItem('token');

  async function loadResumes() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/resume`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load resumes.');
      setResumes(data.resumes || []);
    } catch (error) {
      setBanner({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadResumes(); }, []);

  function selectFile(file) {
    if (!file) return;
    setSelectedFile(file);
    setBanner(null);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  async function uploadResume() {
    if (!selectedFile) {
      setBanner({ type: 'error', message: 'Please select a resume first.' });
      return;
    }
    const formData = new FormData();
    formData.append('resume', selectedFile);

    try {
      setUploading(true);
      setBanner(null);
      const response = await fetch(`${API_URL}/api/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Resume upload failed.');
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setBanner({ type: 'success', message: 'Resume uploaded successfully.' });
      await loadResumes();
    } catch (error) {
      setBanner({ type: 'error', message: error.message });
    } finally {
      setUploading(false);
    }
  }

  async function makePrimary(id) {
    try {
      const response = await fetch(`${API_URL}/api/resume/${id}/primary`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to change primary resume.');
      setBanner({ type: 'success', message: 'Primary resume updated.' });
      await loadResumes();
    } catch (error) {
      setBanner({ type: 'error', message: error.message });
    }
  }

  async function deleteResume(resume) {
    if (!window.confirm(`Are you sure you want to delete "${resume.original_name}"?`)) return;
    try {
      const response = await fetch(`${API_URL}/api/resume/${resume.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to delete resume.');
      setBanner({ type: 'success', message: 'Resume deleted.' });
      await loadResumes();
    } catch (error) {
      setBanner({ type: 'error', message: error.message });
    }
  }

  async function downloadResume(resume) {
    try {
      const response = await fetch(`${API_URL}/api/resume/${resume.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Unable to download resume.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = resume.original_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setBanner({ type: 'error', message: error.message });
    }
  }

  function formatSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(date) {
    if (!date) return '';
    return new Date(`${date} UTC`).toLocaleDateString();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>My Resumes</h1><p>Upload and manage the resumes you use for job applications.</p></div>
      </div>

      {banner && <div className={`banner ${banner.type}`} role="alert">{banner.message}</div>}

      <section className="card">
        <h2>Upload a Resume</h2>
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragEnter={e => { e.preventDefault(); setDragging(true); }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="upload-icon">↑</div>
          <strong>Drag and drop your resume here</strong>
          <span>or</span>
          <button type="button" className="button secondary" onClick={() => fileInput.current?.click()}>Choose File</button>
          <input ref={fileInput} className="hidden-file-input" type="file" accept=".pdf,.docx" onChange={e => selectFile(e.target.files[0])} />
          <small>PDF or DOCX, maximum 5 MB</small>
        </div>

        {selectedFile && (
          <div className="selected-file">
            <div><strong>{selectedFile.name}</strong><span>{formatSize(selectedFile.size)}</span></div>
            <button type="button" className="button primary" onClick={uploadResume} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        )}
      </section>

      <section className="card resume-section">
        <div className="section-header">
          <div><h2>Uploaded Resumes</h2><p>{resumes.length} resume(s)</p></div>
        </div>

        {loading ? <p>Loading resumes...</p> : resumes.length === 0 ? (
          <div className="empty-state"><h3>No resumes yet</h3><p>Upload your first resume above.</p></div>
        ) : (
          <div className="resume-list">
            {resumes.map(resume => (
              <article className="resume-item" key={resume.id}>
                <div className="resume-information">
                  <div className="file-icon">FILE</div>
                  <div>
                    <div className="resume-name">
                      <strong>{resume.original_name}</strong>
                      {!!resume.is_primary && <span className="primary-badge">Primary</span>}
                    </div>
                    <span className="resume-meta">{formatSize(resume.file_size)} • Uploaded {formatDate(resume.uploaded_at)}</span>
                  </div>
                </div>
                <div className="resume-actions">
                  <button className="button secondary" type="button" onClick={() => downloadResume(resume)}>Download</button>
                  {!resume.is_primary && <button className="button secondary" type="button" onClick={() => makePrimary(resume.id)}>Make Primary</button>}
                  <button className="button danger" type="button" onClick={() => deleteResume(resume)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Resumes;
