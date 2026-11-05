import React from 'react';
function SaveJobButton({ saved, pending, onToggle }) {
  return (
    <button
      type="button"
      className={saved ? 'button primary' : 'button secondary'}
      aria-pressed={saved}
      disabled={pending}
      onClick={onToggle}
    >
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}

export default SaveJobButton;
