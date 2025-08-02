import React from 'react';

const ProtectedRoute = ({ children }) => {
  // You'll need to implement your authentication logic here
  // For now, it simply renders its children
  return (
    <>
      {children}
    </>
  );
};

export default ProtectedRoute;