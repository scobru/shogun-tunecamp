import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';

export const AuthCallback = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { loginWithPair } = useAuthStore();
    const [status, setStatus] = useState<string>('Authenticating...');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleCallback = async () => {
            const code = searchParams.get('code');
            
            if (!code) {
                setError('No authorization code found');
                return;
            }

            const instanceUrl = localStorage.getItem('mastodon_instance');
            const redirectUri = window.location.origin + '/auth/callback';

            if (!instanceUrl) {
                setError('Session expired or invalid state. Please try again.');
                return;
            }

            try {
                setStatus('Verifying with Mastodon...');
                const response = await API.mastodonCallback(instanceUrl, code, redirectUri);
                
                if (response.success && response.pair) {
                    setStatus('Logging in to GunDB...');
                    await loginWithPair(response.pair);
                    
                    // Cleanup
                    localStorage.removeItem('mastodon_instance');
                    
                    navigate('/');
                } else {
                    setError('Authentication failed: Invalid response');
                }
            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Authentication failed');
            }
        };

        handleCallback();
    }, [searchParams, navigate, loginWithPair]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-base-200">
            <div className="card w-96 bg-base-100 shadow-xl">
                <div className="card-body items-center text-center">
                    <h2 className="card-title text-2xl mb-4">Mastodon Login</h2>
                    
                    {error ? (
                        <div className="alert alert-error">
                            <span>{error}</span>
                            <button className="btn btn-sm" onClick={() => navigate('/')}>Back</button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <span className="loading loading-spinner loading-lg"></span>
                            <p>{status}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthCallback;
