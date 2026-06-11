const PageContent = ({ children, className = "" }) => (
  <main className={`page-content ${className}`.trim()}>{children}</main>
);

export default PageContent;
