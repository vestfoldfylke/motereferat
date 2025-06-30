import { readFileSync } from 'fs'

const packageJsonPath = './package.json'
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

export const getPackageInfo = () => {
  return {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description
  }
}
