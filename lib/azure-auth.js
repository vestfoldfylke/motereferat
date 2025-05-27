import { config } from 'dotenv'
import { DefaultAzureCredential } from '@azure/identity'

if (!process.env.AZURE_CLIENT_ID) config()

// Initialize azure credentials - if required values (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_CERTIFICATE_PATH or AZURE_CLIENT_SECRET) are present in .env, will use them, else default credential-chaining (.env -> managed identity -> azure cli -> azure sdk) will be used
export const defaultAzureCredential = new DefaultAzureCredential({})
