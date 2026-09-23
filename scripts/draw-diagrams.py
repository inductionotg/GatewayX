"""Generate the architecture and circuit-breaker PNGs. Requires Pillow."""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
INK = "#18324b"

class Diagram:
    def __init__(self, width, height):
        self.image = Image.new("RGB", (width, height), "#ffffff")
        self.draw = ImageDraw.Draw(self.image)


    def text(self, x, y, text, size=22, color=INK):
        font_path = Path("C:/Windows/Fonts/arial.ttf")
        font = ImageFont.truetype(str(font_path) if font_path.exists() else "DejaVuSans.ttf", size)
        lines = text.split("\n")
        width = max(self.draw.textlength(line, font=font) for line in lines)
        for i, line in enumerate(lines):
            self.draw.text((x, y+i*size*1.3), line, font=font, fill=color)

    def box(self, x, y, w, h, title, detail, color="#e8f2ff"):
        self.draw.rounded_rectangle((x,y,x+w,y+h), radius=12, fill=color, outline=INK, width=2)
        self.text(x+16,y+14,title,23)
        self.text(x+16,y+49,detail,18)

    def arrow(self, points, color="#64748b"):
        self.draw.line(points, fill=color, width=3)
        (px,py),(x,y)=points[-2:]
        a=math.atan2(y-py,x-px)
        self.draw.polygon([(x,y),(x-12*math.cos(a-.45),y-12*math.sin(a-.45)),
                          (x-12*math.cos(a+.45),y-12*math.sin(a+.45))],fill=color)
        x0,y0=points[0]

    def save(self, name):
        self.image.save(ROOT / "docs" / f"{name}.png")

d=Diagram(1450,950)
d.text(40,25,"GatewayX | Request flow and data ownership",36)
d.text(40,80,"Two gateways, three logical services, shared Redis state",22,"#64748b")
# Draw connectors first so node fills cover junctions.
d.arrow([(190,310),(240,310)])
d.arrow([(420,290),(455,290),(455,245),(490,245)])
d.arrow([(420,330),(455,330),(455,445),(490,445)])
for y in [245,445]:
    d.arrow([(730,y),(775,y),(775,355)])
for y in [185,335,485,635]:
    d.arrow([(775,355),(795,355),(795,y),(830,y)])
for y in [185,335]:
    d.arrow([(1060,y),(1110,y),(1110,260),(1150,260)])
d.arrow([(1060,485),(1150,485)])
d.arrow([(1060,635),(1150,635)])
d.arrow([(515,310),(475,310),(475,697),(490,697)])
d.arrow([(610,510),(610,640)])
d.box(40,255,150,110,"Client","Postman / UI")
d.box(240,245,180,130,"Entry: Nginx",":3380 -> :80\nRound robin")
d.box(490,180,240,130,"Gateway 1",":3320 -> :3000\nCustom Express gateway")
d.box(490,380,240,130,"Gateway 2",":3321 -> :3000\nSame code and config")
d.box(830,120,230,130,"Product replica 1",":3312 -> :3002\nRound-robin pool")
d.box(830,270,230,130,"Product replica 2",":3314 -> :3002\nSame logical service")
d.box(830,420,230,130,"Review Service",":3313 -> :3003\nOptional overview data")
d.box(830,570,230,130,"User Service",":3315 -> :3001\nRegistration / credentials")
d.box(1150,195,250,130,"products_db","Both product replicas\nOwn role: products_app","#e7f5ed")
d.box(1150,420,250,130,"reviews_db","Own role: reviews_app\nNo cross-service queries","#e7f5ed")
d.box(1150,570,250,130,"users_db","Own role: users_app\nPassword hashes","#e7f5ed")
d.text(1150,745,"One PostgreSQL container\nThree owned databases",20,"#64748b")
d.box(490,640,240,135,"Shared Redis",":6380 -> :6379\nSessions + token buckets\nAtomic Lua admission","#fff1d6")
d.text(40,820,"Inside each gateway: session -> rate limiter -> route/controller -> downstream client",23)
d.text(40,860,"Downstream client: round robin + per-instance circuit breaker + bounded timeout",22)
d.text(40,900,"Overview fetches product and reviews in parallel. Circuit state stays local to each gateway.",20,"#64748b")
d.save("architecture-diagram")

d=Diagram(1450,880)
d.text(45,30,"GatewayX | Circuit breaker state transitions",36)
d.text(45,90,"One breaker per downstream instance, per gateway process",23,"#64748b")
d.arrow([(410,365),(550,365)])
d.text(420,260,"Failure threshold\nreached (3)",20)
d.arrow([(890,365),(1030,365)])
d.text(905,245,"Cooldown elapsed\n+ next request\n(10 seconds)",19)
d.arrow([(1200,300),(1200,190),(720,190),(720,300)])
d.text(790,153,"Probe fails: restart cooldown",22)
d.arrow([(1200,510),(1200,650),(240,650),(240,510)],"#14805e")
d.text(575,610,"Probe succeeds",24,"#14805e")
d.box(70,300,340,210,"CLOSED","Admit normal requests\nSuccess resets failure count\nFailures increment count","#e7f5ed")
d.box(550,300,340,210,"OPEN","Skip this instance immediately\nTry another healthy replica\nNo calls until cooldown","#ffe9e7")
d.box(1030,300,340,210,"HALF_OPEN","Admit exactly one probe\nOther calls skip this instance\nProbe result selects next state","#fff1d6")
d.text(70,725,"Failures: connection errors, timeout, 5xx, invalid JSON; review payload validation also counts.",22)
d.text(70,765,"Normal 4xx responses are healthy for the breaker. Request timeout defaults to 2 seconds.",22)
d.text(70,815,"Stale in-flight results cannot overwrite a newer state. Defaults are configurable through environment variables.",19,"#64748b")
d.save("circuit-breaker-state-diagram")
print("Generated two PNG diagrams.")
