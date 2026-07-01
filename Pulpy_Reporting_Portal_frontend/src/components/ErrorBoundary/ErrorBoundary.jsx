import { Component } from 'react';
import ErrorFallback from './ErrorFallback';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    resetError = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <ErrorFallback
                    error={this.state.error}
                    resetError={this.resetError}
                    type={this.props.type}
                />
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
