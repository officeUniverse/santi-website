"""Create original portfolio UI illustrations using synthetic data only.
No source screenshots or private records are read by this script.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/imgs/projects/houses-of-nomad'
OUT.mkdir(parents=True,exist_ok=True)
FONT=Path('/System/Library/Fonts/Supplemental')
INK='#22312F'; MUTED='#697572'; GOLD='#947333'; GREEN='#22664E'; BLUE='#345779'; BG='#F3F4F0'; LINE='#DEE3DE'
def font(n=22,bold=False):return ImageFont.truetype(str(FONT/('Arial Bold.ttf' if bold else 'Arial.ttf')),n)
def text(x,y,s,n=22,c=INK,bold=False):d.text((x,y),s,font=font(n,bold),fill=c)
def box(x,y,w,h,fill='white',outline=LINE,r=16):d.rounded_rectangle((x,y,x+w,y+h),radius=r,fill=fill,outline=outline,width=2)
def pill(x,y,s,fill='#E5F1EA',c=GREEN):
 w=d.textlength(s,font=font(18,True))+26;box(x,y,w,34,fill,fill,8);text(x+13,y+6,s,18,c,True)
def start(title,subtitle,active):
 global im,d
 im=Image.new('RGB',(1600,1000),BG);d=ImageDraw.Draw(im)
 d.rectangle((0,0,1599,91),fill='#20332D');text(35,26,'HOUSES OF NOMAD',26,'#FFFFFF',True);text(350,31,'Booking plugin / Portfolio demonstration',21,'#DCE7DF')
 pill(1160,26,'FICTIONAL DATA ONLY','#DCD2B5','#3C3528')
 d.rectangle((0,92,247,919),fill='#E7ECE6');text(26,125,'ROOM BOOKINGS',19,GREEN,True)
 for i,item in enumerate(['Overview','Bookings','Guest accounts','Calendar','Rooms','Payments & alerts']):
  y=184+i*66
  if item==active:box(15,y-8,216,49,'#20332D','#20332D',8)
  text(29,y,item,20,'white' if item==active else INK,item==active)
 text(284,121,title,36,INK,True);text(284,170,subtitle,22,MUTED)
 d.rectangle((0,920,1600,1000),fill='#E5E8DF');text(32,941,'ILLUSTRATIVE INTERFACE  •  All names, dates, amounts and records are invented.',21,INK,True)
 text(32,972,'Explains the workflow; does not reproduce the production dashboard or its results.',18,MUTED)
def save(name):im.save(OUT/(name+'.png'),optimize=True)
def table(headers,rows,x=284,y=270,widths=None):
 widths=widths or [200]*len(headers);w=sum(widths);box(x,y,w,58+len(rows)*77)
 d.rounded_rectangle((x+1,y+1,x+w-1,y+56),radius=14,fill='#E9EDE8')
 xx=x
 for h,cw in zip(headers,widths):text(xx+18,y+19,h,19,MUTED,True);xx+=cw
 for j,row in enumerate(rows):
  yy=y+58+j*77;d.line((x,yy,x+w,yy),fill=LINE,width=1);xx=x
  for value,cw in zip(row,widths):text(xx+18,yy+25,value,20);xx+=cw
start('An overview of the day','Example reporting period: April 2030','Overview')
for i,(label,value,sub) in enumerate([('Booking value','R86,400','Illustrative gross value'),('Reservations','24','Example month'),('Occupancy','60%','72 of 120 nights'),('Awaiting action','3','Example pending records')]):
 x=284+i*319;box(x,222,300,157);text(x+20,243,label,21,MUTED);text(x+20,281,value,39,INK,True);text(x+20,338,sub,18,MUTED)
box(284,405,784,443);text(309,430,'Reservations by sample period',25,INK,True)
vals=[2,5,4,6,3,4]
for i,v in enumerate(vals):
 x=343+i*110;h=v*43;box(x,774-h,59,h,'#8FAE98','#8FAE98',8);text(x+18,739-h,str(v),21,INK,True);text(x+6,790,'P'+str(i+1),19,MUTED)
box(1090,405,473,443);text(1114,430,'Next arrivals',25,INK,True)
for i,(guest,room,date) in enumerate([('Demo Guest A','Apartment A','08 Apr 2030'),('Demo Guest B','Apartment B','11 Apr 2030'),('Demo Guest C','Apartment C','15 Apr 2030')]):
 y=492+i*109;text(1116,y,guest,22,INK,True);text(1116,y+33,room+'  /  '+date,20,MUTED)
save('demo-dashboard')
start('Reservations, in one place','Search, filter and review a booking alongside its sync status.','Bookings')
pill(284,219,'All demonstration rooms','#E6EAE4',INK);pill(580,219,'All statuses','#E6EAE4',INK);pill(789,219,'April 2030','#E6EAE4',INK)
table(['Reference','Property','Guest','Stay','Value','Status','Sync'],[
['DEMO-01','Apartment A','Demo Guest A','08–11 Apr','R3,600','Confirmed','Synced'],['DEMO-02','Apartment B','Demo Guest B','11–15 Apr','R6,600','Pending','Review'],['DEMO-03','Apartment C','Unavailable','15–18 Apr','—','Blocked','Synced'],['DEMO-04','Apartment A','Demo Guest D','21–23 Apr','R2,400','Cancelled','Synced']],widths=[156,177,185,178,140,167,155])
box(284,679,1258,160);text(309,704,'A booking is more than a date range.',26,INK,True);text(309,748,'Room, guest, stay dates, source and status stay together in the working record.',23,MUTED);text(309,786,'Example actions: search bookings, edit a record, review sync status or import calendar data.',21,MUTED)
save('demo-bookings')
start('Availability at a glance','A simplified calendar example with invented stays and blocked dates.','Calendar')
text(288,230,'APRIL 2030 / EXAMPLE WEEK',24,INK,True)
for i,day in enumerate(['MON 08','TUE 09','WED 10','THU 11','FRI 12','SAT 13','SUN 14']):
 x=284+i*180;box(x,285,176,410);text(x+16,308,day,20,INK,True)
for x,y,w,label,col in [(291,368,526,'Apartment A • Confirmed','#216C50'),(831,429,526,'Apartment B • Hostaway','#6C5592'),(651,490,346,'Apartment C • Blocked','#637D8A'),(1191,551,346,'Apartment A • Pending','#9A712A')]:
 box(x,y,w,49,col,col,8);text(x+14,y+14,label,19,'white',True)
text(301,743,'Confirmed stays',21,GREEN,True);text(571,743,'External reservations',21,'#6C5592',True);text(897,743,'Unavailable dates',21,'#637D8A',True)
text(301,802,'Month, week and list views support different ways of planning the same schedule.',22,MUTED)
save('demo-calendar')
start('Rooms and guest accounts','Illustrative records show the structure, without exposing real people or properties.','Rooms')
table(['Example property','Pricing','Capacity','Connection'],[['Apartment A','R1,200 / night','2 guests','Hostaway listing'],['Apartment B','R1,650 / night','4 guests','Hostaway listing'],['Apartment C','R2,100 / night','4 guests','Hostaway listing']],y=233,widths=[340,300,260,358])
box(284,560,1258,290);text(310,587,'Guest account example',27,INK,True);text(310,639,'Demo Guest A',25,INK,True);text(310,678,'guest-a@example.test',22,MUTED);pill(310,723,'Fictional account','#E6EAE4',INK)
text(822,641,'Account tools',23,INK,True);text(822,684,'View booking history',22,MUTED);text(822,725,'Create a booking for a guest',22,MUTED);text(822,766,'Maintain account information',22,MUTED)
save('demo-rooms-accounts')
start('Payments and notifications','Configuration examples, not the live site’s payment policy.','Payments & alerts')
box(284,228,580,605);text(310,258,'Payment configuration',27,INK,True)
for y,label,val in [(323,'Gateway','PayFast'),(411,'Deposit enabled','Yes'),(499,'Example deposit','30%')]:
 text(310,y,label,22,MUTED);box(310,y+32,524,46,'#F5F6F2');text(326,y+42,val,22,INK,True)
text(310,639,'Fictional calculation',22,INK,True);text(310,683,'R3,600 booking × 30% = R1,080',24,GREEN,True);text(310,737,'Example balance: R2,520',22,MUTED)
box(888,228,666,605);text(916,258,'Keep the right people informed',26,INK,True)
for i,label in enumerate(['New booking submitted','Payment received','Payment failed','Booking cancelled','Connection or payment error','Guest confirmation']):
 y=326+i*66;box(916,y,27,27,GREEN,GREEN,5);text(960,y+1,label,22)
save('demo-payments')
# A conceptual flow diagram, not a claim about timing or implementation internals.
start('Website to operations','A simplified view of the connected booking workflow.','Bookings')
for x,title,sub in [(286,'Website','Browse properties'),(714,'WordPress plugin','Manage bookings'),(1142,'Hostaway','Connected records')]:
 box(x,287,400,200);text(x+24,316,title,28,INK,True);text(x+24,366,sub,23,MUTED);text(x+24,414,'Guest journey' if x==286 else ('Operational workspace' if x==714 else 'Reservations & availability'),19,GREEN,True)
for x in [691,1119]:
 d.line((x,385,x+18,385),fill=GOLD,width=4);d.polygon([(x+19,385),(x+10,378),(x+10,392)],fill=GOLD)
box(286,536,1256,303);text(313,566,'Illustrative sequence',27,INK,True)
for i,line in enumerate(['1. A guest chooses an apartment and a stay.', '2. The booking is managed through the custom WordPress plugin.', '3. Hostaway-linked records keep bookings and unavailable dates aligned.', '4. Staff review status and notifications in the booking workspace.']):text(313,620+i*46,line,22,MUTED)
save('demo-sync-flow')
print('Created six original illustrations with fictional data only.')
