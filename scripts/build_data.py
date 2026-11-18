import pandas as pd, json, re, sys
# ใช้งาน: python scripts/build_data.py <ไฟล์กลุ่ม.xlsx> <ไฟล์สินค้า.csv>
# ผลลัพธ์: data/products.js
import os
if len(sys.argv)<3: sys.exit('usage: python scripts/build_data.py groups.xlsx products.csv')
x=pd.read_excel(sys.argv[1],sheet_name='กลุ่ม').fillna('')
c=pd.read_csv(sys.argv[2],dtype={'CODE':str,'BARCODE':str})
gnames=sorted(c['กลุ่ม'].unique(), key=lambda g:-int((c['กลุ่ม']==g).sum()))
gi={g:i for i,g in enumerate(gnames)}
meta={r['กลุ่ม'].strip():r for _,r in x.iterrows()}
def core(s): return re.sub(r'\(.*?\)','',s).strip()
def split(s): return [t.strip() for t in re.split(r'[,،]',str(s)) if t.strip()]
def find_group(item):
    it=core(item)
    for g in gnames:
        if core(g)==it: return gi[g]
    for g in gnames:
        cg=core(g)
        if len(it)>=3 and (it in g or (len(cg)>=3 and cg in it)): return gi[g]
    return None
groups=[]
miss=[]
for g in gnames:
    m=meta.get(g)
    if m is None:
        # try loose match
        for k,v in meta.items():
            if core(k)==core(g): m=v;break
    syn=split(m['คำพ้อง']) if m is not None else []
    base=[t.strip() for t in re.split(r'[/()]',g) if t.strip()]
    pairs=[]
    if m is not None:
        for it in split(m['ซื้อคู่กัน']):
            j=find_group(it)
            if j is not None and j!=gi[g] and j not in pairs: pairs.append(j)
    groups.append({'n':g,'s':list(dict.fromkeys(base+syn)),'w':m['ประเภทงาน'] if m is not None else '',
                   'd':m['คำอธิบาย'] if m is not None else '','pr':pairs,'k':int((c['กลุ่ม']==g).sum()),'m':m is not None})
print('groups with meta',sum(g['m'] for g in groups),'of',len(groups), 'unmatched sheet:',[k for k in meta if k not in gi])
prods=[]
for _,r in c.iterrows():
    prods.append([str(r['CODE']),str(r['NAME']).strip(),str(r['UNIT_TYPE']) if pd.notna(r['UNIT_TYPE']) else '',
                  float(r['PRICE_1']) if pd.notna(r['PRICE_1']) else 0,
                  float(r['STK_ONHAND']) if pd.notna(r['STK_ONHAND']) else 0, gi[r['กลุ่ม']],
                  str(r['BARCODE']) if pd.notna(r['BARCODE']) else ''])
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data','products.js')
with open(out,'w',encoding='utf-8') as f:
    f.write('window.PRODUCT_DATA = '+json.dumps({'g':groups,'p':prods},ensure_ascii=False,separators=(',',':'))+';\n')
print('wrote',out,len(prods),'products')
