export type LoginPageParams = {
  clientId: string
  redirectUri: string
  scope?: string
  state?: string
  error?: string
  clientName?: string
}

export function generateLoginPage(params: LoginPageParams): string {
  const { clientId, redirectUri, scope, state, error, clientName } = params

  const errorHtml = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - OAuth Authorization</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
      width: 100%;
      max-width: 400px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header p {
      color: #666;
      font-size: 14px;
    }
    .client-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 24px;
      text-align: center;
    }
    .client-info span {
      color: #667eea;
      font-weight: 600;
    }
    .error {
      background: #fee2e2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      color: #374151;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 6px;
    }
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input[type="email"]:focus,
    input[type="password"]:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    .user-type-group {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }
    .user-type-option {
      flex: 1;
    }
    .user-type-option input {
      display: none;
    }
    .user-type-option label {
      display: block;
      text-align: center;
      padding: 10px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 500;
    }
    .user-type-option input:checked + label {
      border-color: #667eea;
      background: #f0f3ff;
      color: #667eea;
    }
    .user-type-option label:hover {
      border-color: #667eea;
    }
    button[type="submit"] {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.2s;
    }
    button[type="submit"]:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }
    button[type="submit"]:active {
      transform: translateY(0);
    }
    .scope-info {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
    .scope-info strong {
      color: #374151;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Sign In</h1>
      <p>Authorize access to your account</p>
    </div>

    ${
      clientName
        ? `<div class="client-info">
            <span>${escapeHtml(clientName)}</span> is requesting access
          </div>`
        : ""
    }

    ${errorHtml}

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      ${scope ? `<input type="hidden" name="scope" value="${escapeHtml(scope)}">` : ""}
      ${state ? `<input type="hidden" name="state" value="${escapeHtml(state)}">` : ""}
      <input type="hidden" name="response_type" value="code">

      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email" placeholder="you@example.com">
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Enter your password">
      </div>

      <label>Account Type</label>
      <div class="user-type-group">
        <div class="user-type-option">
          <input type="radio" id="type-customer" name="user_type" value="customer" checked>
          <label for="type-customer">Customer</label>
        </div>
        <div class="user-type-option">
          <input type="radio" id="type-seller" name="user_type" value="seller">
          <label for="type-seller">Seller</label>
        </div>
        <div class="user-type-option">
          <input type="radio" id="type-admin" name="user_type" value="user">
          <label for="type-admin">Admin</label>
        </div>
      </div>

      <button type="submit">Authorize</button>

      ${
        scope
          ? `<div class="scope-info">
              <strong>Requested permissions:</strong> ${escapeHtml(scope)}
            </div>`
          : ""
      }
    </form>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char])
}
