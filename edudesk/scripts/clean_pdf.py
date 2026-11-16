"""Produce a blank master copy of a fillable PDF.

Clears every field value (text fields empty, checkboxes Off), gives empty text fields a blank
appearance that keeps their original background/border colours, keeps the original /DA font
settings and field names, and writes only reachable objects so no earlier values remain in the
file.

Usage: python3 scripts/clean_pdf.py input.pdf output.pdf      (requires: pip install pypdf)
"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, DecodedStreamObject, DictionaryObject, ArrayObject, FloatObject, TextStringObject


def color_ops(c, stroke):
    if not c:
        return ''
    v = ' '.join(f'{float(x):.3f}' for x in c)
    op = {1: 'G' if stroke else 'g', 3: 'RG' if stroke else 'rg', 4: 'K' if stroke else 'k'}.get(len(c))
    return f'{v} {op} ' if op else ''


def main(src, dst):
    reader = PdfReader(src)
    writer = PdfWriter(clone_from=reader)
    for page in writer.pages:
        for a in page.get('/Annots', []) or []:
            w = a.get_object()
            if w.get('/Subtype') != '/Widget':
                continue
            ft = w.get('/FT') or (w.get('/Parent').get_object().get('/FT') if w.get('/Parent') else None)
            target = w if '/T' in w else w.get('/Parent').get_object()
            if ft == '/Btn':
                target[NameObject('/V')] = NameObject('/Off')
                w[NameObject('/AS')] = NameObject('/Off')
            elif ft == '/Tx':
                target[NameObject('/V')] = TextStringObject('')
                rect = [float(x) for x in w['/Rect']]
                width, height = rect[2] - rect[0], rect[3] - rect[1]
                mk = w.get('/MK', {})
                ops = ''
                if mk.get('/BG'):
                    ops += f"q {color_ops(mk['/BG'], False)}0 0 {width:.2f} {height:.2f} re f Q "
                if mk.get('/BC'):
                    ops += f"q {color_ops(mk['/BC'], True)}1 w 0.5 0.5 {width - 1:.2f} {height - 1:.2f} re S Q"
                stream = DecodedStreamObject()
                stream.set_data(ops.encode('latin-1'))
                stream.update({NameObject('/Type'): NameObject('/XObject'), NameObject('/Subtype'): NameObject('/Form'),
                               NameObject('/BBox'): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(width), FloatObject(height)])})
                ap = DictionaryObject()
                ap[NameObject('/N')] = writer._add_object(stream)
                w[NameObject('/AP')] = ap
    try:
        writer.compress_identical_objects(remove_duplicates=False, remove_unreferenced=True)
    except TypeError:
        writer.compress_identical_objects(remove_identicals=False, remove_orphans=True)
    with open(dst, 'wb') as f:
        writer.write(f)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
