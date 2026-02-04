import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authAPI } from '../../services/api';
import './Settings.css';

function UpdateProfile() {
    const { user, updateProfile } = useAuth();
    const toast = useToast();
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        fullName: user?.fullName || '',
        email: user?.email || '',
        companyName: user?.companyName || '',
        phone: user?.phone || ''
    });

    // Password Change State
    const [passStep, setPassStep] = useState(0); // 0: Idle, 1: Verify OTP, 2: New Password
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [passLoading, setPassLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await updateProfile(formData);
            toast.success('Profile updated successfully!');
        } catch (error) {
            toast.error('Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    // Password Handlers
    const requestOtp = async () => {
        setPassLoading(true);
        try {
            await authAPI.requestChangePasswordOtp();
            setPassStep(1);
            toast.info(`OTP sent to ${user.email}`);
        } catch (err) {
            toast.error(err.message || 'Failed to send OTP');
        } finally { setPassLoading(false); }
    };

    const verifyOtp = async () => {
        setPassLoading(true);
        try {
            const res = await authAPI.verifyChangePasswordOtp(otp);
            setResetToken(res.resetToken);
            setPassStep(2);
            toast.success('OTP Verified');
        } catch (err) {
            toast.error(err.message || 'Invalid OTP');
        } finally { setPassLoading(false); }
    };

    const changePassword = async () => {
        if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
        if (newPassword.length < 6) return toast.error('Password too short');

        setPassLoading(true);
        try {
            await authAPI.changePassword(resetToken, newPassword);
            toast.success('Password changed successfully');
            updateProfile({ mustChangePassword: false });
            setPassStep(0);
            setOtp('');
            setNewPassword('');
            setConfirmPassword('');
            setResetToken('');
        } catch (err) {
            toast.error(err.message || 'Failed to change password');
        } finally { setPassLoading(false); }
    };

    return (
        <div className="settings-page">
            <div className="settings-header">
                <h1>Update Profile</h1>
                <p>Manage your account settings and preferences</p>
            </div>

            <div className="settings-form-container">
                {/* Avatar Section */}
                <div className="settings-avatar-section">
                    <div className="settings-avatar">
                        {user?.fullName?.charAt(0) || 'U'}
                    </div>
                    <div className="settings-avatar-info">
                        <h3>{user?.fullName || 'User'}</h3>
                        <p>{user?.email || 'user@example.com'}</p>
                    </div>
                </div>

                {/* Personal Information Form */}
                <form onSubmit={handleProfileUpdate}>
                    <div className="settings-form-section">
                        <h3 className="settings-form-section-title">Personal Information</h3>
                        <div className="settings-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Full Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <input
                                    type="email"
                                    className="form-control"
                                    value={formData.email}
                                    disabled
                                    style={{ opacity: 0.7 }}
                                />
                                <div className="form-helper">Email cannot be changed</div>
                            </div>
                        </div>

                        <div className="settings-form-row two-col">
                            <div className="form-group">
                                <label className="form-label">Company Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    name="companyName"
                                    value={formData.companyName}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Phone Number</label>
                                <input
                                    type="tel"
                                    className="form-control"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : 'Update Profile'}
                        </button>
                    </div>
                </form>

                <hr style={{ margin: '30px 0', border: '0', borderTop: '1px solid #eee' }} />

                {/* Change Password with OTP */}
                <div className="settings-form-section">
                    <h3 className="settings-form-section-title">Change Password</h3>
                    <p style={{ color: '#666', marginBottom: '15px' }}>
                        To change your password, you must verify your identity via email OTP.
                    </p>

                    {passStep === 0 && (
                        <button className="btn btn-outline" onClick={requestOtp} disabled={passLoading}>
                            {passLoading ? 'Sending OTP...' : 'Change Password via OTP'}
                        </button>
                    )}

                    {passStep === 1 && (
                        <div style={{ maxWidth: '400px' }}>
                            <div className="form-group">
                                <label className="form-label">Enter OTP sent to {user?.email}</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="6-digit OTP"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                    />
                                    <button className="btn btn-primary" onClick={verifyOtp} disabled={passLoading}>
                                        Verify
                                    </button>
                                </div>
                            </div>
                            <button className="btn btn-link" onClick={() => setPassStep(0)}>Cancel</button>
                        </div>
                    )}

                    {passStep === 2 && (
                        <div style={{ maxWidth: '400px' }}>
                            <div className="form-group">
                                <label className="form-label">New Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    placeholder="Enter new password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Confirm Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    placeholder="Confirm new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn btn-success" onClick={changePassword} disabled={passLoading}>
                                    {passLoading ? 'Updating...' : 'Set New Password'}
                                </button>
                                <button className="btn btn-link" onClick={() => setPassStep(0)}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default UpdateProfile;
