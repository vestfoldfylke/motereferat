import TurndownService from 'turndown'
import { SHAREPOINT } from '../../config.js'
import { convert } from 'html-to-text'

export const turndownService = new TurndownService()

const isSpLink = (url) => {
  if (!url) return false
  const trimmed = url.trim()
  return !trimmed.startsWith('https://') && (trimmed.substring(0, 17).includes('/r/sites/') || trimmed.startsWith('/sites/'))
}

turndownService.remove(['script', 'title'])

turndownService.addRule('Link', {
  filter: (node) => {
    if (node.nodeName !== 'A') return false
    const linkTitle = node.getAttribute('title')
    if (linkTitle) {
      node.removeAttribute('title') // Haha, modify it here in the filter
    }
    if (node.innerHTML.trim() === '' || isSpLink(node.getAttribute('href')) || node.children.length > 0) {
      return true
    }
    return false
  },
  replacement: (content, node) => {
    const href = node.getAttribute('href')
    if (!href) return ''

    console.log('link', href)

    let useHref
    // If spLink, fix it
    if (isSpLink(href)) {
      useHref = `https://${SHAREPOINT.TENANT_NAME}.sharepoint.com${href}`
    }

    if (node.innerHTML.trim() === '') {
      // If sp site link, we assume document Library and use filename, else we use entire link
      if (useHref.startsWith(`https://${SHAREPOINT.TENANT_NAME}`) && useHref.includes('/sites/')) {
        try {
          const fileName = useHref.split('/').pop().split('?')[0].trim()
          const decoded = decodeURIComponent(fileName)
          return `[${decoded}](${useHref})`
        } catch (error) {
          console.error('Error processing link:', error)
        }
        return `[${useHref}](${useHref})`
      }
    }

    // We have innerHTML
    if (node.children.length > 0) {
      const textContent = convert(node.innerHTML, { wordwrap: false })
      return `[${textContent}](${useHref})`
    }

    return `[${content}](${useHref})`
  }
})
