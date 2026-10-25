"""Optional read-only validation of the two private synthetic PDF QA outputs."""
import os
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

root = Path(os.environ['SHOP_PDF_QA_DIR'])
if not root.is_absolute():
    raise ValueError('Absolute SHOP_PDF_QA_DIR required')
for filename in ['normal-preview.pdf', 'long-preview.pdf']:
    reader = PdfReader(root / filename)
    assert not any(key in reader.trailer['/Root'] for key in ['/AcroForm', '/OpenAction', '/AA'])
    with pdfplumber.open(root / filename) as pdf:
        text = ''
        for index, page in enumerate(pdf.pages):
            page_text = page.extract_text()
            text += page_text
            assert 'VORSCHAU - KEINE AUSGESTELLTE RECHNUNG' in page_text
            assert f'Seite {index + 1} von {len(pdf.pages)}' in page_text
            assert not reader.pages[index].get('/Annots')
            for word in page.extract_words():
                assert 40 <= word['x0'] < word['x1'] <= page.width - 39, (filename, word)
                assert 25 <= word['top'] < word['bottom'] <= 805, (filename, word)
        for amount in ['399,00', '75,81', '474,81']:
            assert amount in text
        if filename.startswith('normal'):
            assert 'Şahin & Müller' in text
    print(f'{filename}: {len(reader.pages)} pages; warnings, totals, Unicode, bounds and inactive content verified')
