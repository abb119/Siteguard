export const getSessionId = (): string => {
    let sessionId = sessionStorage.getItem('siteguard_session_id');
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem('siteguard_session_id', sessionId);
    }
    return sessionId;
};
