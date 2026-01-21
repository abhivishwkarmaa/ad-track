import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import logoImage from '../../assets/logo.png';
import './Login.css'; // Reuse login styles

function ForgotPassword() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password, 4: Success
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleRequestOtp = async (e) => {
        e.preventDefault();
        setLoading(true); setError(''); setMessage('');
        try {
            await authAPI.requestPasswordResetOtp(email);
            setStep(2);
            setMessage(`OTP sent to ${email}`);
        } catch (err) {
            setError(err.message || 'Failed to send OTP');
        } finally { setLoading(false); }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true); setError(''); setMessage('');
        try {
            const res = await authAPI.verifyPasswordResetOtp(email, otp);
            setResetToken(res.resetToken);
            setStep(3);
            setMessage('OTP Verified. Please set a new password.');
        } catch (err) {
            setError(err.message || 'Invalid OTP');
        } finally { setLoading(false); }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        setLoading(true); setError(''); setMessage('');
        try {
            await authAPI.resetPassword(resetToken, newPassword);
            setStep(4);
            setMessage('Password reset successfully!');
            setTimeout(() => navigate('/login'), 3000);
        } catch (err) {
            setError(err.message || 'Failed to reset password');
        } finally { setLoading(false); }
    };

    return (
        <div className="login-page">
            <div className="login-left">
                <div className="login-brand">
                    <div className="login-logo">
                        {logoImage ? <img src={logoImage} alt="Logo" /> : <span className="login-logo-text">TM</span>}
                    </div>
                    <h1>Track MyAds</h1>
                </div>

                <div className="login-card">
                    <h2 className="login-title">Reset Password</h2>
                    <p className="login-subtitle">
                        {step === 1 && "Enter your email to receive an OTP"}
                        {step === 2 && "Enter the OTP sent to your email"}
                        {step === 3 && "Create a new password"}
                        {step === 4 && "All set!"}
                    </p>

                    {error && <div className="login-error">{error}</div>}
                    {message && <div style={{ color: 'green', marginBottom: '15px', textAlign: 'center' }}>{message}</div>}

                    {step === 1 && (
                        <form className="login-form" onSubmit={handleRequestOtp}>
                            <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <input
                                    type="email"
                                    className="form-control"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <button type="submit" className="login-btn" disabled={loading}>
                                {loading ? 'Sending Request...' : 'Request OTP'}
                            </button>
                            <div style={{ marginTop: '15px', textAlign: 'center' }}>
                                <Link to="/login" style={{ color: '#666', textDecoration: 'none' }}>Back to Login</Link>
                            </div>
                        </form>
                    )}

                    {step === 2 && (
                        <form className="login-form" onSubmit={handleVerifyOtp}>
                            <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <input type="email" className="form-control" value={email} disabled style={{ backgroundColor: '#f0f0f0' }} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Enter OTP</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Enter 6-digit OTP"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    required
                                    maxLength={6}
                                />
                            </div>
                            <button type="submit" className="login-btn" disabled={loading}>
                                {loading ? 'Verifying...' : 'Verify OTP'}
                            </button>
                            <div style={{ marginTop: '15px', textAlign: 'center' }}>
                                <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Change Email</button>
                            </div>
                        </form>
                    )}

                    {step === 3 && (
                        <form className="login-form" onSubmit={handleResetPassword}>
                            <div className="form-group">
                                <label className="form-label">New Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    placeholder="New password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
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
                                    required
                                />
                            </div>
                            <button type="submit" className="login-btn" disabled={loading}>
                                {loading ? 'Resetting...' : 'Reset Password'}
                            </button>
                        </form>
                    )}

                    {step === 4 && (
                        <div style={{ textAlign: 'center' }}>
                            <p>Your password has been reset successfully.</p>
                            <Link to="/login" className="login-btn" style={{ display: 'inline-block', textDecoration: 'none', marginTop: '10px' }}>Go to Login</Link>
                        </div>
                    )}
                </div>
            </div>

            <div className="login-right">
                <div className="login-illustration">
                    <h2>Secure Your Account</h2>
                    <p>Follow the steps to reset your password securely using valid Email verification.</p>
                </div>
            </div>
        </div>
    );
}

export default ForgotPassword;
