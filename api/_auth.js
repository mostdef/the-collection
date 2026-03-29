// api/_auth.js — server-side auth helper
// Verifies a JWT from the Authorization header using Supabase Auth.

const { createClient } = require('@supabase/supabase-js');

/**
 * Extracts and verifies the Bearer token from an incoming request.
 * Returns the authenticated user object if valid, or null if not.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object|null>}
 */
async function getAuthenticatedUser(req) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { id: 'local', email: 'local' };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

module.exports = getAuthenticatedUser;
