import io
import logging
import re
from html.parser import HTMLParser

import requests

logger = logging.getLogger(__name__)

DOC_CHAR_CAP = 5000
WEBSITE_CHAR_CAP = 5000
MAX_DOCUMENTS = 3
MAX_UPLOAD_BYTES = 500 * 1024
TEXT_EXTENSIONS = ('.txt', '.md', '.csv')


class KnowledgeError(Exception):
    """Raised when a knowledge source cannot be ingested."""


class TextExtractor(HTMLParser):
    """Collect visible text from HTML, skipping scripts and styles."""

    def __init__(self):
        super().__init__()
        self.chunks = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'):
            self.skip_depth += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript') and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data):
        if not self.skip_depth and data.strip():
            self.chunks.append(data.strip())


def clean_text(text):
    """Collapse whitespace runs into readable text."""
    return re.sub(r'\s+', ' ', text).strip()


def extract_document_text(filename, content):
    """Extract plain text from an uploaded knowledge document."""
    lowered = filename.lower()
    if lowered.endswith('.pdf'):
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(content))
            pages = [page.extract_text() or '' for page in reader.pages[:20]]
            text = clean_text(' '.join(pages))
        except Exception as exc:
            logger.info('PDF extraction failed for %s: %s', filename, exc)
            raise KnowledgeError('Could not read that PDF. Try a text file instead.')
    elif lowered.endswith(TEXT_EXTENSIONS):
        try:
            text = clean_text(content.decode('utf-8', errors='ignore'))
        except Exception:
            raise KnowledgeError('Could not read that file as text.')
    else:
        raise KnowledgeError('Supported files: .txt, .md, .csv, .pdf')
    if not text:
        raise KnowledgeError('That file has no readable text.')
    return text[:DOC_CHAR_CAP]


def fetch_website_text(url):
    """Download a page and return its readable text."""
    if not url.startswith(('http://', 'https://')):
        raise KnowledgeError('Enter a full URL starting with http:// or https://')
    try:
        response = requests.get(url, timeout=12, headers={'User-Agent': 'Mozilla/5.0 (BizAlly knowledge fetch)'})
    except requests.exceptions.RequestException:
        raise KnowledgeError('Could not reach that website.')
    if response.status_code >= 400:
        raise KnowledgeError(f'That page returned an error ({response.status_code}).')
    parser = TextExtractor()
    try:
        parser.feed(response.text)
    except Exception:
        raise KnowledgeError('Could not read that page.')
    text = clean_text(' '.join(parser.chunks))
    if not text:
        raise KnowledgeError('That page has no readable text.')
    return text[:WEBSITE_CHAR_CAP]


def build_knowledge_block(tenant):
    """Combine every knowledge source the vendor has provided."""
    metadata = tenant.metadata or {}
    parts = []
    if metadata.get('aiKnowledge'):
        parts.append(metadata['aiKnowledge'])
    for doc in (metadata.get('knowledgeDocs') or [])[:MAX_DOCUMENTS]:
        if doc.get('text'):
            parts.append(f"FROM DOCUMENT '{doc.get('name', 'document')}':\n{doc['text']}")
    website = metadata.get('websiteKnowledge') or {}
    if website.get('text'):
        parts.append(f"FROM THE BUSINESS WEBSITE ({website.get('url', '')}):\n{website['text']}")
    return '\n\n'.join(parts)
