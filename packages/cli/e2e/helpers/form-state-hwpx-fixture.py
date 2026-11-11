"""Own constructor XML forms; hp:text follows the published Hancom form representation."""
import sys,zipfile,json,html
options=json.loads(sys.argv[3]) if len(sys.argv)>3 else {}
forms=[('checkBtn','check','UNCHECKED'),('checkBtn','check','UNCHECKED'),('radioBtn','A','CHECKED'),('radioBtn','B','UNCHECKED'),('edit','old',None),('comboBox','combo',None)]
with zipfile.ZipFile(sys.argv[1])as a,zipfile.ZipFile(sys.argv[2],'w')as b:
    for item in a.infolist():
        data=a.read(item)
        if item.filename=='Contents/section0.xml':
            rows=[]
            for i,(tag,text,value)in enumerate(forms):
                enabled='false' if options.get('disabledIndex')==i else 'true'
                if options.get('unknownStateIndex')==i:value='MYSTERY'
                group='' if options.get('unnamedIndex')==i else options.get('groupName','Group A')
                attrs=f'id="{100+i}" name="F{i}" enabled="{enabled}" editable="true" foreColor="#000000" backColor="#ffffff" backStyle="OPAQUE" opaque="retain" drawFrame="true"'
                if value is not None:attrs+=f' caption="{text}" triState="true" radioGroupName="{html.escape(group,quote=True)}" value="{value}"'
                if tag=='edit':attrs+=f' readOnly="{str(bool(options.get("readOnly"))).lower()}" numOnly="false" multiLine="true" maxLength="100"'
                if tag=='comboBox':attrs+=' editEnable="true" selectedValue="keep-selected"'
                children='<hp:formCharPr charPrIDRef="0" followContext="true" autoSz="false" wordWrap="false"/>'
                if tag in ['edit','comboBox']:children+=f'<hp:text>{text}</hp:text>'
                if tag=='comboBox':children+='<hp:listItem text="First"/><hp:listItem text="Second"/>'
                children+='<hp:sz width="5000" widthRelTo="ABSOLUTE" height="1500" heightRelTo="ABSOLUTE" protect="false"/><hp:pos treatAsChar="true" affectLSpacing="true" flowWithText="true" allowOverlap="false" holdAnchorAndSO="false" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>'
                rows.append(f'<hp:p id="{100+i}" paraPrIDRef="0" styleIDRef="0" pageBreak="false" columnBreak="false" merged="false"><hp:run charPrIDRef="0"><hp:{tag} {attrs}>{children}</hp:{tag}></hp:run></hp:p>')
            data=data.replace(b'</hs:sec>',''.join(rows).encode()+b'</hs:sec>')
        b.writestr(item,data)
