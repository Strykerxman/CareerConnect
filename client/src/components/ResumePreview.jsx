import React from 'react';

// US-05 / Task 05-01 — Shows a resume on the page without downloading it.
function ResumePreview({ state, name, onClose }) {
  const header = (
    <div className="resume-preview-header">
      <h3>{name}</h3>
      <button type="button" className="button secondary" onClick={onClose}>Close</button>
    </div>
  );

  if (state.loading) {
    return (
      <section className="resume-preview" aria-live="polite">
        {header}
        <p role="status">Loading resume...</p>
      </section>
    );
  }

  if (state.error) {
    return (
      <section className="resume-preview" aria-live="polite">
        {header}
        <div className="banner error" role="alert">{state.error}</div>
      </section>
    );
  }

  return (
    <section className="resume-preview" aria-label={`Preview of ${name}`}>
      {header}
      {state.pdfUrl ? (
        <iframe className="resume-preview-frame" title={`Preview of ${name}`} src={state.pdfUrl} />
      ) : (
        // sandbox="" keeps any content inside the document from running scripts.
        <iframe
          className="resume-preview-frame resume-preview-document"
          title={`Preview of ${name}`}
          sandbox=""
          srcDoc={state.html}
        />
      )}
    </section>
  );
}

export default ResumePreview;
