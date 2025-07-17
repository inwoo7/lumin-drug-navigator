const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();

/**
 * Validates Supabase JWT token
 */
async function validateSupabaseJWT(token) {
  try {
    // First, check if token exactly matches stored service role key (fast path)
    try {
      const [serviceVersion] = await secretClient.accessSecretVersion({
        name: 'projects/lumin-drug-navigator-prod/secrets/supabase-service-role-key/versions/latest',
      });
      const serviceRoleKey = serviceVersion.payload.data.toString();
      if (token === serviceRoleKey) {
        return {
          valid: true,
          userId: 'service_role_key',
          email: 'service@supabase.com',
          isServiceRole: true
        };
      }
    } catch (e) {
      console.error('Failed to fetch service role key for comparison:', e.message);
    }

    // Fallback: treat token as JWT and verify with Supabase secret
    const [version] = await secretClient.accessSecretVersion({
      name: 'projects/lumin-drug-navigator-prod/secrets/supabase-jwt-secret/versions/latest',
    });
    const jwtSecret = version.payload.data.toString();

    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'supabase'
    });

    return {
      valid: true,
      userId: decoded.sub || decoded.role || 'unknown',
      email: decoded.email || 'unknown',
      isServiceRole: decoded.role === 'service_role'
    };

  } catch (error) {
    console.error('JWT validation failed:', error.message);
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Gets RunPod API credentials from Secret Manager
 */
async function getRunPodCredentials() {
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: 'projects/lumin-drug-navigator-prod/secrets/runpod-api-key/versions/latest',
    });
    
    return version.payload.data.toString();
  } catch (error) {
    console.error('Failed to get RunPod credentials:', error);
    throw new Error('Authentication configuration error');
  }
}

/**
 * Main Cloud Function entry point
 */
exports.authenticatedTxAgent = async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header',
        expected: 'Bearer <supabase_jwt_token>'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Validate the JWT
    const authResult = await validateSupabaseJWT(token);
    if (!authResult.valid) {
      return res.status(401).json({
        error: 'Invalid JWT token',
        details: authResult.error
      });
    }

    console.log(`Authenticated request from user: ${authResult.userId} (${authResult.email})`);

    // Get RunPod credentials
    const runpodApiKey = await getRunPodCredentials();
    const runpodAuthHeader = runpodApiKey.startsWith('Bearer ') ? runpodApiKey : `Bearer ${runpodApiKey}`;
    // Get RunPod endpoint URL from environment or default
    const runpodEndpoint = process.env.RUNPOD_ENDPOINT_URL || 'https://api.runpod.ai/v2/your-endpoint-id/run';
    
    // Prepare the request to RunPod
    const runpodPayload = {
      input: req.body // Pass through the entire request body as input
    };

    console.log('Forwarding request to RunPod:', {
      endpoint: runpodEndpoint,
      inputKeys: Object.keys(runpodPayload.input)
    });

    // Forward request to RunPod TxAgent
    const runpodResponse = await fetch(runpodEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': runpodAuthHeader
      },
      body: JSON.stringify(runpodPayload),
      timeout: 300000 // 5 minute timeout
    });

    if (!runpodResponse.ok) {
      const errorBody = await runpodResponse.text();
      console.error('RunPod API error details:', {
        status: runpodResponse.status,
        statusText: runpodResponse.statusText,
        errorBody: errorBody,
        requestPayload: runpodPayload
      });
      throw new Error(`RunPod submission failed (${runpodResponse.status}): ${errorBody}`);
    }

    const runpodData = await runpodResponse.json();

    // === NORMALIZE OUTPUT =============================================
    let normalizedData = runpodData;
    try {
      // If the root object itself contains choices/tokens we unwrap once
      normalizedData = flattenRunpodOutput(runpodData);
      // Some endpoints nest the useful output inside a top-level "output" key
      if (normalizedData && normalizedData.output) {
        normalizedData.output = flattenRunpodOutput(normalizedData.output);
      }
    } catch (normErr) {
      console.warn('Output normalization failed:', normErr.message);
      // fall back to original runpodData
      normalizedData = runpodData;
    }

    // After normalization, ensure we return an object with .output for compatibility
    if (typeof normalizedData === 'string') {
      normalizedData = { output: normalizedData };
    }

    // Log success
    console.log('RunPod request completed successfully:', {
      userId: authResult.userId,
      status: runpodResponse.status,
      outputSize: JSON.stringify(normalizedData).length
    });

    // Return the RunPod response
    res.status(200).json({
      success: true,
      data: normalizedData,
      metadata: {
        userId: authResult.userId,
        timestamp: new Date().toISOString(),
        source: 'authenticated-gateway'
      }
    });

  } catch (error) {
    console.error('Gateway error:', error);
    
    // Return appropriate error response
    if (error.message.includes('timeout')) {
      res.status(504).json({
        error: 'Request timeout',
        message: 'TxAgent request took too long to complete'
      });
    } else if (error.message.includes('RunPod')) {
      res.status(502).json({
        error: 'TxAgent service error',
        message: 'Failed to communicate with document generation service'
      });
    } else {
      res.status(500).json({
        error: 'Internal gateway error',
        message: 'An unexpected error occurred'
      });
    }
  }
}; 

// === Helper =============================================================
function flattenRunpodOutput(obj) {
  // 1) choices[0].message.content
  if (obj?.choices?.[0]?.message?.content) {
    return obj.choices[0].message.content;
  }
  // 2) choices[0].tokens (array)
  if (obj?.choices?.[0]?.tokens) {
    const toks = obj.choices[0].tokens;
    return toks.map(t => typeof t === 'string' ? t : (t.text || t.content || '')).join('');
  }
  // 3) tokens directly on object
  if (Array.isArray(obj?.tokens)) {
    return obj.tokens.map(t => typeof t === 'string' ? t : (t.text || t.content || '')).join('');
  }
  return obj; // nothing to flatten
}
// ====================================================================== 