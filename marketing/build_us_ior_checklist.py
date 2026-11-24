from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUT = "output/pdf/tracewize-us-foreign-ior-preflight.pdf"
NAVY = colors.HexColor("#17324D")
BLUE = colors.HexColor("#2F6B9A")
PALE = colors.HexColor("#EEF4F8")
INK = colors.HexColor("#263746")
MUTED = colors.HexColor("#5B6B78")
LINE = colors.HexColor("#D6E0E8")
GOLD = colors.HexColor("#F3B64B")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="TWTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=23, leading=26, textColor=NAVY, alignment=TA_LEFT,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="TWDeck", parent=styles["Normal"], fontName="Helvetica",
    fontSize=10.2, leading=14, textColor=MUTED, spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="TWHead", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=12, leading=15, textColor=NAVY, spaceBefore=4, spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="TWBody", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.1, leading=12.2, textColor=INK, spaceAfter=0,
))
styles.add(ParagraphStyle(
    name="TWSmall", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.2, leading=9.2, textColor=MUTED, spaceAfter=0,
))
styles.add(ParagraphStyle(
    name="TWCheck", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=9.2, leading=12, textColor=BLUE, alignment=TA_LEFT,
))


def p(text, style="TWBody"):
    return Paragraph(text, styles[style])


def checklist_item(number, title, body):
    left = p(f"{number:02d}", "TWCheck")
    right = p(f"<b>{title}</b><br/>{body}", "TWBody")
    table = Table([[left, right]], colWidths=[0.42 * inch, 6.95 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), PALE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -1), 0.45, LINE),
    ]))
    return table


def footer(canvas, doc):
    canvas.saveState()
    w, h = letter
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, 0.48 * inch, w - doc.rightMargin, 0.48 * inch)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(NAVY)
    canvas.drawString(doc.leftMargin, 0.29 * inch, "TRACEWIZE")
    canvas.setFont("Helvetica", 7.3)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(w - doc.rightMargin, 0.29 * inch, "Import-route readiness | tracewize.com")
    canvas.restoreState()


doc = BaseDocTemplate(
    OUT, pagesize=letter, leftMargin=0.58 * inch, rightMargin=0.58 * inch,
    topMargin=0.45 * inch, bottomMargin=0.65 * inch,
    title="US Foreign IOR Preflight Checklist | TraceWize",
    author="TraceWize",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates([PageTemplate(id="one", frames=frame, onPage=footer)])

story = [
    p("Before your U.S. import clears", "TWTitle"),
    p("A practical preflight for China-based sellers shipping to the U.S. | CBP rule effective January 5, 2027", "TWDeck"),
]

scope = Table([[
    p("<b>THE CHANGE</b><br/>For covered entries for consumption on or after Jan. 5, 2027, a non-CTPAT foreign IOR must designate a licensed, CTPAT-validated broker to make entry. The rule says only Canadian foreign IORs are currently eligible for CTPAT validation. In a specified power-of-attorney situation, the broker must act as IOR if its principal is not the goods' owner or purchaser. A broker license alone is not enough.", "TWBody")
]], colWidths=[7.37 * inch])
scope.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PALE),
    ("BOX", (0, 0), (-1, -1), 0.8, BLUE),
    ("LINEBEFORE", (0, 0), (0, 0), 4, GOLD),
    ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ("TOPPADDING", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
]))
story += [scope, Spacer(1, 7), p("Ask your forwarder or customs broker - and keep the written answers", "TWHead")]

items = [
    (1, "Who is the actual IOR?", "Get the legal name and IOR number shown on the entry paperwork. Do not assume the seller account, shipper, forwarder, or consignee is automatically the IOR."),
    (2, "Is the IOR U.S. or foreign under the rule?", "Ask the broker to assess the documented criteria in 19 CFR Part 110. A U.S. mailing address by itself does not establish U.S.-IOR status."),
    (3, "Who files the entry, and is the broker CTPAT-validated?", "If your foreign business is not itself CTPAT-validated, ask the broker to confirm it is licensed and currently CTPAT-validated. CBP says only Canadian foreign IORs are currently eligible for IOR validation. Match the broker's registered name and filer code against CBP's current listing."),
    (4, "Who will appear as IOR on the entry?", "Ask whether your business remains IOR or whether the broker must act as IOR for this transaction. The rule requires the designated CTPAT-validated broker to act as IOR in a specified situation when the principal on the power of attorney is not the owner or purchaser."),
    (5, "When will the goods clear?", "The effective date concerns entry/withdrawal for consumption on or after Jan. 5, 2027. Ask how the route handles goods already in transit or in a bonded warehouse / FTZ."),
    (6, "Does the route provider confirm this shipment is covered?", "Ask Amazon SEND, your forwarder, and the filing broker for route-specific confirmation in writing. Do not infer compliance from the label 'DDP' or from using a familiar carrier."),
]

for item in items:
    story.append(checklist_item(*item))

story += [Spacer(1, 6)]
note = Table([[
    p("<b>Keep these records together:</b> named IOR and number | broker name, license / filer code, and current CTPAT status | broker's role on this entry | written route confirmation | planned clearance date | entry documents.", "TWBody")
]], colWidths=[7.37 * inch])
note.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF8E8")),
    ("BOX", (0, 0), (-1, -1), 0.6, GOLD),
    ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [note, Spacer(1, 5)]
story.append(p(
    "<b>Official sources:</b> <link href='https://www.govinfo.gov/content/pkg/FR-2026-11-06/html/2026-22735.htm' color='#2F6B9A'>CBP interim final rule, 91 FR 69977 (Nov. 6, 2026)</link> | <link href='https://ace-accounts.cbp.gov/s/customs-broker-listing' color='#2F6B9A'>CBP CTPAT-validated broker listing</link>. The rule is interim final; confirm the latest CBP instructions before shipment.",
    "TWSmall",
))
story.append(Spacer(1, 3))
story.append(p(
    "<b>Scope note:</b> This checklist organizes questions; it is not legal advice, does not determine whether an entity qualifies as a U.S. IOR, does not provide customs brokerage, and cannot guarantee entry or release. Confirm shipment-specific treatment with a licensed customs broker or CBP. TraceWize provides an initial, source-backed pre-screen.",
    "TWSmall",
))

doc.build(story)
