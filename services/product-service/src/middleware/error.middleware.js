export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  console.error(error);

  const status = error.status === 400 ? 400 : 500;

  res.status(status).json({
    error: {
      code: status === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR",
      message:
        status === 400
          ? "Invalid request"
          : "An unexpected error occurred",
    },
  });
}