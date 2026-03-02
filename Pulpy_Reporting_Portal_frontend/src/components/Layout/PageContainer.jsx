const PageContainer = ({ children, className = '' }) => {
    return (
        <div className={`app-page-container ${className}`.trim()}>
            {children}
        </div>
    );
};

export default PageContainer;
