# LLM Service Integration Guide for GitHub Copilot

## Overview

This document provides comprehensive instructions for integrating with our Ollama-based LLM service. The service provides direct access to the Ollama API through an Nginx reverse proxy with SSL/TLS termination.

## Service Architecture

- **Backend**: Ollama LLM server
- **Reverse Proxy**: Nginx with SSL/TLS termination and basic authentication

## Base URLs and Endpoints

http://10.10.248.41

### Available Ollama API Endpoints:

#### 1. Generate LLM Response

```http
POST /api/generate
Content-Type: application/json
Authorization: Basic <base64-encoded-credentials>
```

**Request Body:**

```json
{
  "model": "llama3.1:8b",
  "prompt": "Your prompt here",
  "stream": false,
  "format": "json",
  "options": {
    "temperature": 0.7,
    "top_p": 0.9,
    "num_predict": 1000
  }
}
```

**Required Fields:** `model`, `prompt`
**Optional Fields:** `stream`, `format`, `options` (containing temperature, top_p, num_predict, etc.)

**Response:**

```json
{
  "success": true,
  "response": "LLM generated response text",
  "model": "llama3.2:1b",
  "created_at": "2025-12-21T10:30:00Z",
  "done": true
}
```

#### 2. List Available Models

```http
GET /api/tags
Authorization: Basic <base64-encoded-credentials>
```

**Response:**

```json
{
  "models": [
    {
      "name": "llama3.2:1b",
      "modified_at": "2025-12-21T10:30:00Z",
      "size": 1234567890,
      "digest": "sha256:abc123...",
      "details": {
        "format": "gguf",
        "family": "llama"
      }
    }
  ]
}
```

#### 3. Download/Pull New Model

```http
POST /api/pull
Content-Type: application/json
Authorization: Basic <base64-encoded-credentials>
```

**Request Body:**

```json
{
  "name": "phi3:3.8b"
}
```

## Authentication

The service uses HTTP Basic Authentication through the nginx proxy. Include the `Authorization` header with base64-encoded credentials.

### Available Test Credentials:

```
admin / admin123      (Administrator)
student1 / pass123    (John Cohen)
student2 / mypass456  (Sarah Levy)
student3 / secure789  (David Israel)
student4 / code2024   (Michelle David)
teacher1 / teach999   (Dr. Rachel Gold)
```

### Creating Authorization Header:

```python
import base64
username = "student1"
password = "pass123"
credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
auth_header = f"Basic {credentials}"
```

## Error Responses

Error responses follow standard HTTP status codes with JSON error details:

```json
{
  "error": "Error description"
}
```

**Common Error Codes:**

- `400`: Bad request (invalid JSON, missing fields)
- `401`: Authentication failed (invalid credentials)
- `404`: Model not found
- `429`: Rate limit exceeded (too many requests)
- `500`: Internal server error
- `503`: Service unavailable

## Model Information

### Available Models (confirmed working):

- `llama3.1:8b` - Large model for complex tasks (~8GB RAM)
- Additional models can be pulled as needed

### Other Models (can be downloaded):

- `llama3.2:1b` - Small, fast model (~1GB RAM)
- `llama3.2:3b` - Medium model (~3GB RAM)
- `phi3:3.8b` - Microsoft Phi-3 model (~4GB RAM)
- `gemma2:2b` - Google Gemma 2 model (~2GB RAM)

### Model Selection Guidelines:

- Use smaller models (1b-3b) for quick responses
- Use larger models (7b+) for complex reasoning tasks
- Check available models with the `/api/llm/models` endpoint

## Integration Examples

### Python Integration Example:

```python
import requests
import json
import base64

class LLMServiceClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        self.headers = {
            'Authorization': f'Basic {credentials}',
            'Content-Type': 'application/json'
        }

    def generate_response(self, model, prompt, **options):
        """Generate response from LLM"""
        url = f"{self.base_url}/api/generate"
        data = {
            'model': model,
            'prompt': prompt,
            'options': options
        }

        response = requests.post(url, json=data, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def list_models(self):
        """Get available models"""
        url = f"{self.base_url}/api/tags"

        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

# Usage
client = LLMServiceClient('http://10.10.248.41', 'student1', 'pass123')
result = client.generate_response('llama3.1:8b', 'Explain quantum computing')
print(result['response'])
```

### JavaScript/Node.js Integration Example:

```javascript
class LLMServiceClient {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const credentials = btoa(`${username}:${password}`);
    this.headers = {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    };
  }

  async generateResponse(model, prompt, options = {}) {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        model,
        prompt,
        options,
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async listModels() {
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      headers: this.headers,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

// Usage
const client = new LLMServiceClient(
  "http://10.10.248.41",
  "student1",
  "pass123",
);
const result = await client.generateResponse(
  "llama3.1:8b",
  "Write a Python function",
);
console.log(result.response);
```

### cURL Examples:

```bash
# Generate response
curl -X POST http://10.10.248.41/api/generate \
  -u "student1:pass123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:8b",
    "prompt": "Explain machine learning",
    "options": {
      "temperature": 0.7
    }
  }'

# List models
curl -u "student1:pass123" http://10.10.248.41/api/tags

# Alternative with explicit Authorization header
curl -X POST http://10.10.248.41/api/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'student1:pass123' | base64)" \
  -d '{
    "model": "llama3.1:8b",
    "prompt": "Explain machine learning",
    "options": {
      "temperature": 0.7
    }
  }'
```

## Best Practices for Copilot Integration

### 1. Error Handling

Handle HTTP status codes and check for error messages:

```python
try:
    result = client.generate_response(model, prompt)
    print(result['response'])
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 401:
        print("Authentication failed")
    elif e.response.status_code == 429:
        print("Rate limit exceeded. Please wait before retrying.")
        retry_after = e.response.headers.get('Retry-After', 60)
        time.sleep(int(retry_after))
    else:
        error_data = e.response.json()
        print(f"Error: {error_data.get('error', 'Unknown error')}")
```

### 2. Model Selection Strategy

```python
# Check available models first
models = client.list_models()
available_models = [m['name'] for m in models['models']]

# Use available model (llama3.1:8b is currently installed)
preferred_models = ['llama3.1:8b', 'llama3.2:1b', 'phi3:3.8b', 'gemma2:2b']
selected_model = next((m for m in preferred_models if m in available_models), available_models[0])
```

### 3. Prompt Optimization

- Keep prompts concise but specific
- Use temperature 0.1-0.3 for factual responses
- Use temperature 0.7-0.9 for creative responses
- Set `num_predict` in options to limit response length
- Use `format: "json"` for structured responses

### 4. Rate Limiting

The service has endpoint-specific rate limiting:

- **Generate endpoint** (`/api/generate`): 5 requests per minute per IP
- **Model operations** (`/api/tags`, `/api/pull`): 20 requests per minute per IP
- **General API**: 10 requests per minute per IP (fallback)
- **Health check** (`/health`): No rate limiting

Implement exponential backoff for retries and handle 429 errors.

### 5. Streaming Support

For real-time responses, set `"stream": true` and handle line-delimited JSON responses.

## Network Configuration

### Firewall Ports

- Port 80 (HTTP, redirects to HTTPS)
- Port 443 (HTTPS, nginx proxy)
- Port 11434 (Ollama, internal only)

### Security Headers

The service includes standard security headers:

- `Strict-Transport-Security`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `X-XSS-Protection`

## Troubleshooting

### Common Issues:

1. **Connection refused**: Check if server is running and ports are open
2. **Authentication failed**: Verify username/password in student registry
3. **Model not found**: Check available models with `/api/tags`
4. **Timeout errors**: LLM processing can be slow; increase timeout values
5. **Rate limiting (429 errors)**: Wait 60 seconds between requests, implement exponential backoff

### Health Check:

```bash
curl https://your-domain.com/health
# Should return: "healthy"
```

### Debug Mode:

Check server logs for detailed error information when troubleshooting integration issues.

## Support and Maintenance

- Monitor server resources (RAM, CPU, disk space)
- Models require significant disk space (1-10GB each)
- Regular backups of student registry and configurations
- SSL certificate renewal (if using Let's Encrypt)

---

**Note**: This service is designed for educational use with student authentication through nginx basic auth. Use the direct Ollama API endpoints documented above for integration.
