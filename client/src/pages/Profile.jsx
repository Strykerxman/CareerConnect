import { useEffect, useState } from 'react';

const API_URL = 'http://localhost:4000';
const BIO_LIMIT = 500;

function Profile() {
  const [profile, setProfile] = useState({
    fullName: '', headline: '', location: '', phone: '', bio: '',
    skills: '', linkedinUrl: '', companyName: ''
  });
  const [role, setRole] = useState('job_seeker');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load profile.');
        const p = data.profile;
        setRole(data.role || 'job_seeker');
        setProfile({
          fullName: p.full_name || '',
          headline: p.headline || '',
          location: p.location || '',
          phone: p.phone || '',
          bio: p.bio || '',
          skills: Array.isArray(p.skills) ? p.skills.join(', ') : '',
          linkedinUrl: p.linkedin_url || '',
          companyName: p.company_name || ''
        });
      } catch (error) {
        setBanner({ type: 'error', message: error.message });
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [token]);

  function handleChange(event) {
    const { name, value } = event.target;
    setProfile(previous => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setBanner(null);
    const skills = profile.skills.split(',').map(s => s.trim()).filter(Boolean);

    try {
      const response = await fetch(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: profile.fullName,
          headline: profile.headline,
          location: profile.location,
          phone: profile.phone,
          bio: profile.bio,
          skills: role === 'job_seeker' ? skills : [],
          linkedinUrl: profile.linkedinUrl,
          companyName: role === 'recruiter' ? profile.companyName : ''
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save profile.');
      setBanner({ type: 'success', message: 'Profile saved successfully.' });
    } catch (error) {
      setBanner({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="loading">Loading profile...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>My Profile</h1><p>Keep your personal and professional information up to date.</p></div>
      </div>

      {banner && <div className={`banner ${banner.type}`} role="alert">{banner.message}</div>}

      <form className="card profile-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" value={profile.fullName} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label htmlFor="headline">Headline</label>
            <input id="headline" name="headline" value={profile.headline} onChange={handleChange} placeholder="Computer Engineering Student" />
          </div>
          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input id="location" name="location" value={profile.location} onChange={handleChange} placeholder="Montreal, QC" />
          </div>
          <div className="form-group">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" value={profile.phone} onChange={handleChange} />
          </div>
          <div className="form-group full-width">
            <label htmlFor="linkedinUrl">LinkedIn</label>
            <input id="linkedinUrl" name="linkedinUrl" type="url" value={profile.linkedinUrl} onChange={handleChange} placeholder="https://linkedin.com/in/..." />
          </div>

          {role === 'job_seeker' && (
            <div className="form-group full-width">
              <label htmlFor="skills">Skills</label>
              <input id="skills" name="skills" value={profile.skills} onChange={handleChange} placeholder="Java, C++, JavaScript, Python" />
              <span className="field-help">Separate skills with commas.</span>
            </div>
          )}

          {role === 'recruiter' && (
            <div className="form-group full-width">
              <label htmlFor="companyName">Company</label>
              <input id="companyName" name="companyName" value={profile.companyName} onChange={handleChange} placeholder="Company name" />
            </div>
          )}

          <div className="form-group full-width">
            <div className="label-row">
              <label htmlFor="bio">About</label>
              <span className={profile.bio.length >= BIO_LIMIT ? 'character-count limit' : 'character-count'}>
                {profile.bio.length}/{BIO_LIMIT}
              </span>
            </div>
            <textarea id="bio" name="bio" rows="6" maxLength={BIO_LIMIT} value={profile.bio} onChange={handleChange} placeholder="Tell recruiters a little about yourself..." />
          </div>
        </div>

        <div className="form-actions">
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Profile;
