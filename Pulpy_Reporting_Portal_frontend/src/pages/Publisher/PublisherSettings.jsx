import { useState, useEffect } from 'react';
import { publisherAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useRefresh } from '../../context/RefreshContext';
import { SkeletonDetail } from '../../components/Skeleton/Skeleton';
import { resetAppClientData } from '../../utils/appClientLifecycle';
import './PublisherSettings.css';

export default function PublisherSettings() {
    const [activeTab, setActiveTab] = useState('postback');
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [savingPostback, setSavingPostback] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [passStep, setPassStep] = useState(0);
    const [otp, setOtp] = useState('');
    const [passLoading, setPassLoading] = useState(false);

    // Form states
    const [postbackUrl, setPostbackUrl] = useState('');
    const [firstName, setFirstName] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [country, setCountry] = useState('');

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const { showToast } = useToast();
    const { refreshKey } = useRefresh();

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const res = await publisherAPI.getProfile();
            if (res.success && res.data) {
                setProfile(res.data);
                setPostbackUrl(res.data.global_postback_url || '');
                setFirstName(res.data.first_name || '');
                setCompanyName(res.data.company_name || '');
                setCountry(res.data.country || '');
            }
        } catch (err) {
            showToast(err.message || 'Error loading profile', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, [refreshKey]);

    const handleSavePostback = async (e) => {
        e.preventDefault();
        try {
            setSavingPostback(true);
            const res = await publisherAPI.updateProfile({
                global_postback_url: postbackUrl,
            });
            if (res.success) {
                showToast('Global postback URL saved successfully!', 'success');
                fetchProfile();
            } else {
                showToast(res.message || 'Failed to save postback URL', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Error saving postback URL', 'error');
        } finally {
            setSavingPostback(false);
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        try {
            setSavingProfile(true);
            const res = await publisherAPI.updateProfile({
                first_name: firstName,
                company_name: companyName,
                country: country,
            });
            if (res.success) {
                showToast('Profile information updated successfully!', 'success');
                fetchProfile();
            } else {
                showToast(res.message || 'Failed to update profile', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Error updating profile', 'error');
        } finally {
            setSavingProfile(false);
        }
    };

    const requestOtp = async () => {
        try {
            setPassLoading(true);
            const res = await publisherAPI.requestPasswordOtp();
            if (res.success) {
                setPassStep(1);
                showToast(`OTP sent to ${profile?.email || 'your email'}`, 'success');
            } else {
                showToast(res.message || 'Failed to send OTP', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Failed to send OTP', 'error');
        } finally {
            setPassLoading(false);
        }
    };

    const verifyOtp = async () => {
        try {
            setPassLoading(true);
            const res = await publisherAPI.verifyPasswordOtp(otp);
            if (res.success) {
                setPassStep(2);
                showToast('OTP verified', 'success');
            } else {
                showToast(res.message || 'Invalid OTP', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Invalid OTP', 'error');
        } finally {
            setPassLoading(false);
        }
    };

    const changePassword = async () => {
        if (newPassword !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        if (newPassword.length < 6) {
            showToast('Password must be at least 6 characters long', 'error');
            return;
        }
        try {
            setPassLoading(true);
            const res = await publisherAPI.resetPasswordWithOtp(newPassword);
            if (res.success) {
                showToast('Password changed successfully', 'success');
                setPassStep(0);
                setOtp('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                showToast(res.message || 'Failed to change password', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Failed to change password', 'error');
        } finally {
            setPassLoading(false);
        }
    };

    const insertMacro = (macro) => {
        setPostbackUrl((prev) => {
            const trimmed = (prev || '').trim();
            if (!trimmed) return `https://yourtracker.com/postback?${macro}`;
            const separator = trimmed.includes('?') ? (trimmed.endsWith('?') || trimmed.endsWith('&') ? '' : '&') : '?';
            return `${trimmed}${separator}${macro}`;
        });
    };

    // Live preview simulation of postback URL
    const getSimulatedUrl = () => {
        if (!postbackUrl) return 'https://yourtracker.com/postback?click_id=clk_824901&payout=12.50&event=default';
        return postbackUrl
            .replace(/{affiliate_click_id}/gi, 'clk_824901')
            .replace(/{click_id}/gi, 'clk_824901')
            .replace(/{rcid}/gi, 'clk_824901')
            .replace(/{payout}/gi, '12.50')
            .replace(/{conversion_id}/gi, 'conv_9173204')
            .replace(/{offer_id}/gi, '101')
            .replace(/{event}/gi, 'install')
            .replace(/{sub1}/gi, 'campaignA')
            .replace(/{sub2}/gi, 'banner01');
    };

    if (loading) {
        return <SkeletonDetail sections={2} />;
    }

    return (
        <div className="pub-settings-view">
            {/* View Header */}
            <div className="pub-view-header">
                <div>
                    <h2 className="pub-view-title">Postback & Account Settings</h2>
                    <p className="pub-view-subtitle">
                        Configure your server conversion postbacks, profile details, and security credentials.
                    </p>
                </div>
            </div>

            {/* Segmented Navigation Tabs */}
            <div className="pub-tabs-nav">
                <button
                    type="button"
                    className={`pub-tab-btn ${activeTab === 'postback' ? 'active' : ''}`}
                    onClick={() => setActiveTab('postback')}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tab-icon">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <span>Server Postback</span>
                </button>

                <button
                    type="button"
                    className={`pub-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
                    onClick={() => setActiveTab('profile')}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tab-icon">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>Profile Info</span>
                </button>

                <button
                    type="button"
                    className={`pub-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
                    onClick={() => setActiveTab('security')}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tab-icon">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Password & Security</span>
                </button>
            </div>

            {/* Tab 1: Server Postback */}
            {activeTab === 'postback' && (
                <div className="pub-tab-panel">
                    <div className="pub-card-elevated">
                        <div className="pub-card-top">
                            <div>
                                <h3 className="pub-card-heading">Global S2S Postback URL</h3>
                                <p className="pub-card-sub">
                                    Our tracking system will execute a server-to-server HTTP GET call to this URL whenever your traffic produces a conversion.
                                </p>
                            </div>
                            <span className="pub-tag-highlight">Server-to-Server</span>
                        </div>

                        <form onSubmit={handleSavePostback} className="pub-form-body">
                            <div className="pub-input-group">
                                <label className="pub-label">Postback URL Endpoint</label>
                                <div className="pub-input-wrapper">
                                    <input
                                        type="url"
                                        className="pub-input"
                                        placeholder="https://yourtracker.com/postback?click_id={affiliate_click_id}&payout={payout}"
                                        value={postbackUrl}
                                        onChange={(e) => setPostbackUrl(e.target.value)}
                                    />
                                    {postbackUrl && (
                                        <button
                                            type="button"
                                            className="pub-clear-btn"
                                            onClick={() => setPostbackUrl('')}
                                            title="Clear input"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <span className="pub-field-note">
                                    💡 <strong>Tip:</strong> Use <code>{'{affiliate_click_id}'}</code> to receive back your unique click identifier that you passed in the tracking link.
                                </span>
                            </div>

                            {/* Macro Insertion Bar */}
                            <div className="pub-macro-section">
                                <div className="macro-bar-header">
                                    <span className="macro-bar-title">Click to insert dynamic macros:</span>
                                    <span className="macro-bar-sub">Replaced automatically on conversion</span>
                                </div>
                                <div className="pub-macro-pills">
                                    <button
                                        type="button"
                                        className="macro-chip primary"
                                        onClick={() => insertMacro('click_id={affiliate_click_id}')}
                                    >
                                        <span className="chip-badge">Recommended</span>
                                        <code>{'{affiliate_click_id}'}</code>
                                    </button>
                                    <button
                                        type="button"
                                        className="macro-chip"
                                        onClick={() => insertMacro('click_id={click_id}')}
                                    >
                                        <code>{'{click_id}'}</code>
                                    </button>
                                    <button
                                        type="button"
                                        className="macro-chip"
                                        onClick={() => insertMacro('payout={payout}')}
                                    >
                                        <code>{'{payout}'}</code>
                                    </button>
                                    <button
                                        type="button"
                                        className="macro-chip"
                                        onClick={() => insertMacro('txid={conversion_id}')}
                                    >
                                        <code>{'{conversion_id}'}</code>
                                    </button>
                                    <button
                                        type="button"
                                        className="macro-chip"
                                        onClick={() => insertMacro('offer_id={offer_id}')}
                                    >
                                        <code>{'{offer_id}'}</code>
                                    </button>
                                    <button
                                        type="button"
                                        className="macro-chip"
                                        onClick={() => insertMacro('event={event}')}
                                    >
                                        <code>{'{event}'}</code>
                                    </button>
                                    <button
                                        type="button"
                                        className="macro-chip"
                                        onClick={() => insertMacro('sub1={sub1}')}
                                    >
                                        <code>{'{sub1}'}</code>
                                    </button>
                                    <button
                                        type="button"
                                        className="macro-chip"
                                        onClick={() => insertMacro('sub2={sub2}')}
                                    >
                                        <code>{'{sub2}'}</code>
                                    </button>
                                </div>
                            </div>

                            {/* Live Postback Simulation Box */}
                            <div className="pub-preview-box">
                                <div className="preview-top-bar">
                                    <span className="preview-indicator">
                                        <span className="preview-dot" />
                                        Live Firing Simulation Preview
                                    </span>
                                </div>
                                <div className="preview-url-display">
                                    <code>{getSimulatedUrl()}</code>
                                </div>
                                <span className="preview-caption">
                                    This is how the final URL will look when dispatched to your tracking system.
                                </span>
                            </div>

                            <div className="pub-form-actions">
                                <button type="submit" className="pub-btn-primary" disabled={savingPostback}>
                                    {savingPostback ? 'Saving Changes...' : 'Save Postback URL'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* How It Works Guide */}
                    <div className="pub-info-banner">
                        <div className="banner-icon-box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="16" x2="12" y2="12" />
                                <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                        </div>
                        <div className="banner-text">
                            <h4>How S2S Postback Works</h4>
                            <p>
                                1. When generating your tracking links in <strong>My Offers</strong>, attach your click ID: <code>&click_id=YOUR_CLICK_ID</code> (or <code>&affiliate_click_id=YOUR_CLICK_ID</code>).<br />
                                2. When a user converts, our backend matches that click and automatically replaces <code>{'{affiliate_click_id}'}</code> with your original click ID and fires your postback instantly.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: Profile Info */}
            {activeTab === 'profile' && (
                <div className="pub-tab-panel">
                    <div className="pub-card-elevated">
                        <div className="pub-card-top">
                            <div>
                                <h3 className="pub-card-heading">Publisher Information</h3>
                                <p className="pub-card-sub">
                                    Update your contact name, organization, and country.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSaveProfile} className="pub-form-body">
                            <div className="pub-grid-two">
                                <div className="pub-input-group">
                                    <label className="pub-label">Contact / Full Name</label>
                                    <input
                                        type="text"
                                        className="pub-input"
                                        placeholder="Your Name"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                    />
                                </div>

                                <div className="pub-input-group">
                                    <label className="pub-label">Company / Team Name</label>
                                    <input
                                        type="text"
                                        className="pub-input"
                                        placeholder="Company / Media Team"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="pub-grid-two">
                                <div className="pub-input-group">
                                    <label className="pub-label">Email Address (Read-Only)</label>
                                    <input
                                        type="email"
                                        className="pub-input disabled"
                                        value={profile?.email || ''}
                                        disabled
                                    />
                                </div>

                                <div className="pub-input-group">
                                    <label className="pub-label">Country Code / Name</label>
                                    <input
                                        type="text"
                                        className="pub-input"
                                        placeholder="e.g. IN, US, AE"
                                        value={country}
                                        onChange={(e) => setCountry(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="pub-form-actions">
                                <button type="submit" className="pub-btn-primary" disabled={savingProfile}>
                                    {savingProfile ? 'Saving...' : 'Update Profile'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Tab 3: Security & Password */}
            {activeTab === 'security' && (
                <div className="pub-tab-panel">
                    <div className="pub-card-elevated pub-card-narrow">
                        <div className="pub-card-top">
                            <div>
                                <h3 className="pub-card-heading">Change Password</h3>
                                <p className="pub-card-sub">
                                    To change your password, you must verify your identity via email OTP.
                                </p>
                            </div>
                        </div>

                        <div className="pub-form-body">
                            {passStep === 0 && (
                                <button type="button" className="btn btn-outline" onClick={requestOtp} disabled={passLoading}>
                                    {passLoading ? 'Sending OTP...' : 'Change Password via OTP'}
                                </button>
                            )}

                            {passStep === 1 && (
                                <div>
                                    <div className="pub-input-group">
                                        <label className="pub-label">Enter OTP sent to {profile?.email}</label>
                                        <div className="pub-inline-actions">
                                            <input
                                                type="text"
                                                className="pub-input"
                                                placeholder="6-digit OTP"
                                                value={otp}
                                                onChange={(e) => setOtp(e.target.value)}
                                            />
                                            <button type="button" className="pub-btn-primary" onClick={verifyOtp} disabled={passLoading}>
                                                {passLoading ? 'Checking...' : 'Verify'}
                                            </button>
                                        </div>
                                    </div>
                                    <button type="button" className="btn btn-link" onClick={() => setPassStep(0)}>Cancel</button>
                                </div>
                            )}

                            {passStep === 2 && (
                                <div>
                                    <div className="pub-input-group">
                                        <label className="pub-label">New Password</label>
                                        <input
                                            type="password"
                                            className="pub-input"
                                            placeholder="Enter new password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                        />
                                    </div>
                                    <div className="pub-input-group">
                                        <label className="pub-label">Confirm Password</label>
                                        <input
                                            type="password"
                                            className="pub-input"
                                            placeholder="Confirm new password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                        />
                                    </div>
                                    <div className="pub-inline-actions">
                                        <button type="button" className="pub-btn-primary" onClick={changePassword} disabled={passLoading}>
                                            {passLoading ? 'Updating...' : 'Set New Password'}
                                        </button>
                                        <button type="button" className="btn btn-link" onClick={() => setPassStep(0)}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pub-card-elevated pub-card-narrow" style={{ marginTop: 20 }}>
                        <div className="pub-card-top">
                            <div>
                                <h3 className="pub-card-heading">App &amp; browser</h3>
                                <p className="pub-card-sub">
                                    The app also refreshes on its own after you have been idle for a while so updates load without you doing anything. If something still looks wrong on this device, you can clear saved app data—you will need to sign in again.
                                </p>
                            </div>
                        </div>
                        <div className="pub-form-body">
                            <button type="button" className="btn btn-outline" onClick={() => resetAppClientData()}>
                                Clear app data and sign out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
