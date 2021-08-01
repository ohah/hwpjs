'use strict';
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(["CFB"], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require("CFB"));
    module.exports = factory();
  } else {
    root.hwpjs = factory();
  }
}(this, function() {
  function buf2hex(buffer) { // buffer is an ArrayBuffer
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join(' ').toUpperCase();
  }
  function hex2num(hexString) {
    return parseInt(hexString, 16);
  }
  function num2hex(numString) {
    return numString.toString(16);
  }
  function bit2num(num) {
    return parseInt(num, 10).toString(2)
  }
  const Cursor = (function (start) {
    function Cursor (start) {
      this.pos = start ? start : 0
    }
    Cursor.prototype = {};
    Cursor.prototype.move = function(num) {
      return this.pos += num;
    }
    return Cursor;
  })();
  const hwpjs = (function () {
    function hwpjs(blob) {
      this.cfb = CFB.read(new Uint8Array(blob), {type:"buffer"});
      this.hwp = {
        FileHeader : {},
        DocInfo : {},
        BodyText : {},
        BinData : {},
        PrvText : {},
        PrvImage : {},
        DocOptions : {},
        Scripts : {},
        XMLTemplate : {},
        DocHistory : {},
        Text : '',
        ImageCnt: 0,
        Page:0,
      }
      this.hwp = this.Init();
    }
    hwpjs.prototype = {};
    hwpjs.prototype.Init = function() {
      const HWPTAG_BEGIN = 0x10; // 데이터 레코드 값 선언..
      this.hwp.DATA_RECORD = {
        DOC_INFO : {
          HWPTAG_BEGIN : HWPTAG_BEGIN, 
          HWPTAG_DOCUMENT_PROPERTIES : HWPTAG_BEGIN,
          HWPTAG_ID_MAPPINGS : HWPTAG_BEGIN + 1,
          HWPTAG_BIN_DATA : HWPTAG_BEGIN + 2,
          HWPTAG_FACE_NAME : HWPTAG_BEGIN + 3,
          HWPTAG_BORDER_FILL : HWPTAG_BEGIN + 4,
          HWPTAG_CHAR_SHAPE : HWPTAG_BEGIN + 5,
          HWPTAG_TAB_DEF : HWPTAG_BEGIN + 6,
          HWPTAG_NUMBERING : HWPTAG_BEGIN + 7,
          HWPTAG_BULLET : HWPTAG_BEGIN + 8,
          HWPTAG_PARA_SHAPE : HWPTAG_BEGIN + 9,
          HWPTAG_STYLE : HWPTAG_BEGIN + 10,
          HWPTAG_DOC_DATA : HWPTAG_BEGIN + 11,
          HWPTAG_DISTRIBUTE_DOC_DATA : HWPTAG_BEGIN + 12,
          RESERVED : HWPTAG_BEGIN + 13,
          HWPTAG_COMPATIBLE_DOCUMENT : HWPTAG_BEGIN + 14,
          HWPTAG_LAYOUT_COMPATIBILITY : HWPTAG_BEGIN + 15,
          HWPTAG_TRACKCHANGE : HWPTAG_BEGIN + 16,
          HWPTAG_MEMO_SHAPE : HWPTAG_BEGIN + 76,
          HWPTAG_FORBIDDEN_CHAR : HWPTAG_BEGIN + 78,
          HWPTAG_TRACK_CHANGE : HWPTAG_BEGIN + 80,
          HWPTAG_TRACK_CHANGE_AUTHOR : HWPTAG_BEGIN + 81,
        },
        SECTION_TAG_ID : {
          HWPTAG_PARA_HEADER : HWPTAG_BEGIN + 50,
          HWPTAG_PARA_TEXT : HWPTAG_BEGIN + 51,
          HWPTAG_PARA_CHAR_SHAPE : HWPTAG_BEGIN + 52,
          HWPTAG_PARA_LINE_SEG : HWPTAG_BEGIN + 53,
          HWPTAG_PARA_RANGE_TAG : HWPTAG_BEGIN + 54,
          HWPTAG_CTRL_HEADER : HWPTAG_BEGIN + 55,
          HWPTAG_LIST_HEADER : HWPTAG_BEGIN + 56,
          HWPTAG_PAGE_DEF : HWPTAG_BEGIN + 57,
          HWPTAG_FOOTNOTE_SHAPE : HWPTAG_BEGIN + 58,
          HWPTAG_PAGE_BORDER_FILL : HWPTAG_BEGIN + 59,
          HWPTAG_SHAPE_COMPONENT : HWPTAG_BEGIN + 60,
          HWPTAG_TABLE : HWPTAG_BEGIN + 61,
          HWPTAG_SHAPE_COMPONENT_LINE : HWPTAG_BEGIN + 62,
          HWPTAG_SHAPE_COMPONENT_RECTANGLE : HWPTAG_BEGIN + 63,
          HWPTAG_SHAPE_COMPONENT_ELLIPSE : HWPTAG_BEGIN + 64,
          HWPTAG_SHAPE_COMPONENT_ARC : HWPTAG_BEGIN + 65,
          HWPTAG_SHAPE_COMPONENT_POLYGON : HWPTAG_BEGIN + 66,
          HWPTAG_SHAPE_COMPONENT_CURVE : HWPTAG_BEGIN + 67,
          HWPTAG_SHAPE_COMPONENT_OLE : HWPTAG_BEGIN + 68,
          HWPTAG_SHAPE_COMPONENT_PICTURE : HWPTAG_BEGIN + 69,
          HWPTAG_SHAPE_COMPONENT_CONTAINER : HWPTAG_BEGIN + 70,
          HWPTAG_CTRL_DATA : HWPTAG_BEGIN + 71,
          HWPTAG_EQEDIT : HWPTAG_BEGIN + 72,
          RESERVED : HWPTAG_BEGIN + 73,
          HWPTAG_SHAPE_COMPONENT_TEXTART : HWPTAG_BEGIN + 74,
          HWPTAG_FORM_OBJECT : HWPTAG_BEGIN + 75,
          HWPTAG_MEMO_SHAPE : HWPTAG_BEGIN + 76,
          HWPTAG_MEMO_LIST : HWPTAG_BEGIN + 77,
          HWPTAG_CHART_DATA : HWPTAG_BEGIN + 79,
          HWPTAG_VIDEO_DATA : HWPTAG_BEGIN + 82,
          HWPTAG_SHAPE_COMPONENT_UNKNOWN : HWPTAG_BEGIN + 99,
        }
      }

      this.hwp.FileHeader = this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "FileHeader");
      this.hwp.DocInfo = this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "DocInfo");
      this.hwp.BodyText = this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "BodyText");
      this.hwp.BinData = this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "BinData");
      this.hwp.PrvText = this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "PrvText");
      this.hwp.PrvImage = this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "PrvImage");
      this.hwp.DocOptions = {
        _LinkDoc: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "_LinkDoc"),
        DrmLicense: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "DrmLicense"),
      }
      this.hwp.Scripts = {
        DefaultJScript: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "DefaultJScript"),
        JScriptVersion: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "JScriptVersion"),
      }
      this.hwp.XMLTemplate = {
        Schema: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "Schema"),
        Instance: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "Instance"),
      }
      this.hwp.DocHistory = {
        VersionLog0: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "VersionLog0"),
        VersionLog1: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "VersionLog1"),
        VersionLog2: this.cfb.FileIndex.find(FileIndex=>FileIndex.name === "VersionLog2"),
      }
      this.hwp.FileHeader = {
        ...this.hwp.FileHeader,
        data : this.getFileInfo(),
      }
      this.hwp.DocInfo = {
        ...this.hwp.DocInfo,
        data : this.getDocInfo(),
      }
      this.hwp.PrvText = {
        ...this.hwp.PrvText,
        data : this.getPrvText(),
      }
      this.hwp.PrvImage = {
        ...this.hwp.PrvImage,
        data : this.getPrvImage(),
      }
      this.hwp.FaceName = {
        ...this.getDocAttr("HWPTAG_FACE_NAME"),
      }
      this.hwp.CharShape = {
        ...this.getDocAttr("HWPTAG_CHAR_SHAPE"),
      }
      this.hwp.Style = {
        ...this.getDocAttr("HWPTAG_STYLE"),
      }
      this.hwp.BorderFill = {
        ...this.getDocAttr("HWPTAG_BORDER_FILL"),
      }
      this.hwp.ParaShape = {
        ...this.getDocAttr("HWPTAG_PARA_SHAPE"),
      }
      this.hwp.Numbering = {
        ...this.getDocAttr("HWPTAG_NUMBERING"),
      }
      this.hwp.Bullet = {
        ...this.getDocAttr("HWPTAG_BULLET"),
      }
      this.hwp.BodyText = {
        ...this.hwp.BodyText,
        data : this.getSection(),
      }
      this.hwp.ParaHeader = {
        ...this.getBodyAttr("HWPTAG_PARA_HEADER"),
      }
      return this.hwp;
    };
    hwpjs.prototype.getDocAttr = function(name) {
      return Object.values(this.hwp.DocInfo.data).filter(hwptag => {
        if(hwptag.name === name) {
          return hwptag;
        }
      });
    }
    hwpjs.prototype.getBodyAttr = function(name) {
      return Object.values(this.hwp.BodyText.data[0].data).filter(hwptag => { // 섹션 1만 됨 이렇게 하면. 근데 일단 임시
        if(hwptag.name === name) {
          return hwptag;
        }
      });
    }
    hwpjs.prototype.text_shape_attr = function (shape) {
      const data = {};
      data.italic = this.readBit(shape, 0, 0);
      data.bold = this.readBit(shape, 1, 1);
      switch (this.readBit(shape, 2, 3)) {
        case 0:
          data.underline = false;
          break;
        case 1:
          data.underline = "underline";
          break;
        case 2:
          data.underline = "overline";
          break;
        default:
          break;
      }
      switch (this.readBit(shape, 4, 7)) {
        case 0:
          data.underline_shape = "solid";
          break;
        case 1:
          data.underline_shape = "dashed";
          break;
        case 2:
          data.underline_shape = "dotted";
          break;
        case 3:
          data.underline_shape = "dotted";
          break;
        case 4:
          data.underline_shape = "dotted";
          break;
        case 5:
          data.underline_shape = "dotted";
          break;
        case 6:
          data.underline_shape = "dotted";
          break;
        case 7:
          data.underline_shape = "second";
          break;
        case 8:
          data.underline_shape = "double";
          break;
        case 9:
          data.underline_shape = "double";
          break;
        case 10:
          data.underline_shape = "double";
          break;
        case 11:
          data.underline_shape = "wavy";
          break;
        case 12:
          data.underline_shape = "wavy";
          break;
        case 13:
          data.underline_shape = "bold 3d";
          break;
        case 14:
          data.underline_shape = "bold 3d(liquid)";
          break;
        case 15:
          data.underline_shape = "3d monorail";
          break;
        case 16:
          data.underline_shape = "3d monorail(liquid)";
          break;
        default:
          break;
      }
      switch (this.readBit(shape, 8, 10)) {
        case 0:
          data.outline = "none";
          break;
        case 1:
          data.outline = "solid";
          break;
        case 2:
          data.outline = "dot";
          break;
        case 3:
          data.outline = "bold solid";
          break;
        case 4:
          data.outline = "long dot";
          break;
        case 5:
          data.outline = "-.-.-.-.";
          break;
        case 6:
          data.outline = "-..-..-..";
          break;
      }
      switch (this.readBit(shape, 11, 12)) {
        case 0:
          data.shadow = "none";
          break;
        case 1:
          data.shadow = "di continue";
          break;
        case 2:
          data.shadow = "continue";
          break;
      }
      data.relief = this.readBit(shape, 13, 13);
      data.counter_relief = this.readBit(shape, 14, 14);
      data.superscript = this.readBit(shape, 15, 15);
      data.subscript = this.readBit(shape, 16, 16);
      data.subscript = this.readBit(shape, 17, 17);
      data.strikethrough = this.readBit(shape, 18, 20);
      switch (this.readBit(shape, 21, 24)) {
        case 0:
          data.emphasis = "none";
          break;
        case 1:
          data.emphasis = "default";
          break;
        case 2:
          data.emphasis = "empty circle";
        case 3:
          data.emphasis = "∨";
        case 4:
          data.emphasis = "~";
        case 5:
          data.emphasis = "ㆍ";
        case 6:
          data.emphasis = ":";
          break;
      }
      switch (this.readBit(shape, 21, 24)) {
        case 0:
          data.strikethrough_shape = "solid";
          break;
        case 1:
          data.strikethrough_shape = "long dot";
          break;
        case 2:
          data.strikethrough_shape = "dot";
          break;
        case 3:
          data.strikethrough_shape = "-.-.-.-.";
          break;
        case 4:
          data.strikethrough_shape = "-..-..-..";
          break;
        case 5:
          data.strikethrough_shape = "long dash loop";
          break;
        case 6:
          data.strikethrough_shape = "big dot loop";
          break;
        case 7:
          data.strikethrough_shape = "second";
          break;
        case 8:
          data.strikethrough_shape = "solid bold";
          break;
        case 9:
          data.strikethrough_shape = "bold solid";
          break;
        case 10:
          data.strikethrough_shape = "solid bold solid";
          break;
        case 11:
          data.strikethrough_shape = "wave";
          break;
        case 12:
          data.strikethrough_shape = "wave second";
          break;
        case 13:
          data.strikethrough_shape = "bold 3d";
          break;
        case 14:
          data.strikethrough_shape = "bold 3d(liquid)";
          break;
        case 15:
          data.strikethrough_shape = "3d monorail";
          break;
        case 16:
          data.strikethrough_shape = "3d monorail(liquid)";
          break;
        default:
          break;
      }
      data.Kerning = this.readBit(shape, 30, 30);
      return data;
    }
    hwpjs.prototype.getSection = function() { // 작업중 
      const SectionIndex = [];
      this.cfb.FullPaths.map((FullPath, i) => {
        if(FullPath.indexOf("BodyText/Section") !== -1) {
          SectionIndex.push(i);
        }
      });
      return this.cfb.FileIndex.filter((FileIndex, i) => {
        if(SectionIndex.findIndex(s_idx => s_idx === i) !== -1) {
          const content = pako.inflate(this.uint_8(FileIndex.content), { windowBits: -15 }); //압축되어있어 풀어줘야함
          console.log('version', this.hwp.FileHeader.data.version);
          const data = {
            ...this.readSection(content),
          };
          FileIndex.data = data;
          return FileIndex;
        } 
      })
    }
    hwpjs.prototype.CharCode = function(uint_8) {
      return String.fromCharCode(parseInt(uint_8,16))
    }
    hwpjs.prototype.ctrlId = function(ctrlId) {
      return this.textDecoder(this.uint_8(ctrlId).reverse());
    }
    hwpjs.prototype.readSection = function(content) {
      let c = new Cursor(0);
      let result = [];
      let FIRST_PARA = false;
      let ctrl_id = '';
      let cell_count = 0;
      while(c.pos < content.length) {
        const { tag_id, level, size } = this.readRecord(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true));
        const { HWPTAG_PARA_HEADER, HWPTAG_PARA_TEXT, HWPTAG_PARA_CHAR_SHAPE, HWPTAG_PARA_LINE_SEG, HWPTAG_PARA_RANGE_TAG, HWPTAG_CTRL_HEADER, HWPTAG_LIST_HEADER, HWPTAG_PAGE_DEF, HWPTAG_FOOTNOTE_SHAPE, HWPTAG_PAGE_BORDER_FILL, HWPTAG_SHAPE_COMPONENT, HWPTAG_TABLE, HWPTAG_SHAPE_COMPONENT_LINE, HWPTAG_SHAPE_COMPONENT_RECTANGLE, HWPTAG_SHAPE_COMPONENT_ELLIPSE, HWPTAG_SHAPE_COMPONENT_ARC, HWPTAG_SHAPE_COMPONENT_POLYGON, HWPTAG_SHAPE_COMPONENT_CURVE, HWPTAG_SHAPE_COMPONENT_OLE, HWPTAG_SHAPE_COMPONENT_PICTURE, HWPTAG_SHAPE_COMPONENT_CONTAINER, HWPTAG_CTRL_DATA, HWPTAG_EQEDIT, RESERVED, HWPTAG_SHAPE_COMPONENT_TEXTART, HWPTAG_FORM_OBJECT, HWPTAG_MEMO_SHAPE, HWPTAG_MEMO_LIST, HWPTAG_CHART_DATA, HWPTAG_VIDEO_DATA, HWPTAG_SHAPE_COMPONENT_UNKNOWN} = this.hwp.DATA_RECORD.SECTION_TAG_ID;
        let data = {};
        let attribute = {};
        switch (tag_id) {
          case HWPTAG_PARA_HEADER:
            if(cell_count !== 0) {
              cell_count--;
            }
            data = {
              name : "HWPTAG_PARA_HEADER",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              text: this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              control_mask: this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              paragraph_shape_reference_value: this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              paragraph_style_reference_value: this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              paragraph_dvide_type: this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              // text_shapes: this.text_shape_attr(this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8(0, true)),
              text_shapes: this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8(0, true),
              range_tags: this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              line_align: this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              instance_id: this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
            }
            if(this.hwp.FileHeader.data.version >= 5032) {
              data.section_merge = this.dataview(this.uint_8(c.pos, c.move(2))).getUint16(0, true);
            }
            ctrl_id = "";
            result.push(data);
            break;
          case HWPTAG_PARA_TEXT:
            data = {
              name : "HWPTAG_PARA_TEXT",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              content : this.uint_8(content.slice(c.pos, c.pos + size)),
              text : [],
              // text : this.textDecoder(data.content, 'utf-16le'),
              // utf8 : this.textDecoder(data.content, 'utf-8'),
            }
            let pc = new Cursor(0);
            if(FIRST_PARA === false) {
              pc.move(32); //첫 행은 32칸을 이동해야 텍스트값이 나옴. 왜 그러는지는 미래의 내 여친도 모름
              // console.log('data', data);
              // console.log(this.ctrlId(data.content.slice(2, 8)));
              // console.log(this.ctrlId(data.content.slice(4, 8)));
              // data.content = data.content.slice(32, data.content.length);
              FIRST_PARA = true;
            }
            data.ctrl_id = [];
            while (pc.pos < data.content.length) {
              const charCode = this.dataview(this.uint_8(data.content.slice(pc.pos, pc.pos + 2))).getUint16(0, true);
              switch (charCode) {
                // Char //하나의 문자 취급.
                case 0: //unusable 
                  data.ctrl_id.push({type : 'char', name : 'unusable', charCode : charCode})
                  pc.move(2);
                  break;
                case 10: // 한 줄 끝(line break)
                  data.ctrl_id.push({type : 'char', name : 'line break', charCode : charCode})
                  pc.move(2);
                  break;
                case 13: //문단 끝(para break)
                  data.ctrl_id.push({type : 'char', name : 'para break', charCode : charCode})
                  pc.move(2);
                  break;
                case 24: // 하이픈
                  data.ctrl_id.push({type : 'char', name : 'hypen', charCode : charCode})
                  break;
                case 25:
                case 26:
                case 27:
                case 28:
                case 29: // 예약
                  data.ctrl_id.push({type : 'char', name : 'reservation', charCode : charCode})
                  pc.move(2);
                  break;
                case 30: // 묶음 빈칸
                  data.ctrl_id.push({type : 'char', name : 'no break space', charCode : charCode})
                  pc.move(2);
                  break;
                case 31: // 고정폭 빈칸
                  data.ctrl_id.push({type : 'char', name : 'fixed width space', charCode : charCode})
                  pc.move(2);
                  break;
                // Inline * 8 //별도의 오브젝트를 가리키지 않음
                case 4: // 필드 끝
                  data.ctrl_id.push({type : 'Inline', name : 'field end',  char : charCode});
                  pc.move(14)
                  pc.move(16);
                  break;
                case 5:
                case 6:
                case 7: // 예약
                  data.ctrl_id.push({type : 'Inline', name: 'reservation',  char : charCode});
                  pc.move(14)
                  pc.move(16);
                  break;
                case 8: //title mark
                  data.ctrl_id.push({type : 'Inline', name: 'title mark',  char : charCode});
                  pc.move(14)
                  pc.move(16);
                  break;
                case 9: //tab
                  data.ctrl_id.push({type : 'Inline', name: 'indent',  char : charCode});
                  pc.move(14)
                  pc.move(16);
                  break;
                case 19:
                case 20: //예약 
                  data.ctrl_id.push({type : 'Inline', name: 'reservation',  char : charCode});
                  pc.move(14)
                  pc.move(16);
                  break;
                // Extened *8 별도의 오브젝트를 가리킴.
                case 1: //예약
                  data.ctrl_id.push({type : 'Extened', name: 'reservation', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 2: //구역정의 단 정의
                  data.ctrl_id.push({type : 'Extened', name: 'single/zone definition', char : charCode});
                  console.log('구역정의');
                  pc.move(14);
                  pc.move(16);
                  break;
                case 3: //필드 시작(누름틀, 하이퍼링크, 블록 책갈피, 표 계산식, 문서 요약, 사용자 정보, 현재 날짜/시간, 문서 날짜/시간, 파일 경로, 상호 참조, 메일 머지, 메모, 교정부호, 개인정보)
                  data.ctrl_id.push({type : 'Extened', name: 'field start', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 11: //그리기 개체, 표
                  data.ctrl_id.push({type : 'Extened', name: 'OLE', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 12: //예약
                  data.ctrl_id.push({type : 'Extened', name: 'reservation', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 14: //예약
                  data.ctrl_id.push({type : 'Extened', name: 'reservation', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 15: //숨은 설명
                  data.ctrl_id.push({type : 'Extened', name: 'hidden explanation', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 16: //머리말/꼬리말 
                  data.ctrl_id.push({type : 'Extened', name: 'header/footer', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 17: //각주/미주
                  data.ctrl_id.push({type : 'Extened', name: 'foot/end note', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 18: //자동번호(각주, 표 등)
                  data.ctrl_id.push({type : 'Extened', name: 'auto number', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 21: //페이지 컨트롤(감추기, 새 번호로 시작 등)
                  data.ctrl_id.push({type : 'Extened', name: 'page control', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 22: //책갈피 / 찾아보기 표식
                  data.ctrl_id.push({type : 'Extened', name: 'bookmark browe marker', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                case 23: //덧말 /글자 겹침 
                  data.ctrl_id.push({type : 'Extened', name: 'overlapping', char : charCode});
                  pc.move(14);
                  pc.move(16);
                  break;
                default: {
                  const Char = this.uint_8(data.content.slice(pc.pos, pc.pos + charCode))
                  // var t = this.textDecoder(Char, 'utf-16le');
                  // console.log('asdf', t);
                  data.text.push(Char[0]);
                  data.text.push(Char[1]);
                  pc.move(2);
                }
              }
            }
            data.text = this.textDecoder(data.text, 'utf-16le');
            data.utf8 = this.textDecoder(data.content, 'utf-8');
            this.hwp.Text += data.text;
            // console.log("HWPTAG_PARA_TEXT", data);
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_PARA_CHAR_SHAPE:
            data = {
              name : "HWPTAG_PARA_CHAR_SHAPE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              shape : [],
            }
            for(let i=0;i<size/8;i++) {
              const shape = {
                shape_start : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                shape_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              }
              data.shape.push(shape);
            }
            // console.log("HWPTAG_PARA_CHAR_SHAPE", data)
            // c.move(size);
            result.push(data);
            break;
          case HWPTAG_PARA_LINE_SEG:
            // var start = c.pos;
            data = {
              name : "HWPTAG_PARA_LINE_SEG",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              seg : new Array(size/36).fill(true),
            };
            for (let i = 0; i < size/36; i++) {
              data.seg[i] = {
                start_text : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                start_line : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                height_line : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                height_text : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                line_vertical_baseline_distance : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                line_interval : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                start_column : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                sagment_width : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                tag : {}
              }
              // var end = c.pos;
              // c.move(size - (end - start));
              // var tagS = c.pos - 32;
              // var tagE = tagS + 4;
              // const tag = this.dataview(this.uint_8(content.slice(tagS, tagE))).getUint32(0, true);
              const tag = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint8(0, true);
              data.seg[i].tag.data = tag;
              data.seg[i].tag.page_start_line = this.readBit(tag, 0, 0);
              data.seg[i].tag.page_start_line = [];
              for (let k = 0; k < 36; k++) {
                data.seg[i].tag.page_start_line.push(this.readBit(tag, k, k));
              }
              data.seg[i].tag.column_start_line = this.readBit(tag, 1, 1);
              data.seg[i].tag.empty_text = this.readBit(tag, 16, 16);
              data.seg[i].tag.line_first_sagment = this.readBit(tag, 17, 17);
              data.seg[i].tag.line_last_sagment = this.readBit(tag, 18, 18);
              data.seg[i].tag.line_last_auto_hyphenation = this.readBit(tag, 19, 19);
              data.seg[i].tag.indent = this.readBit(tag, 20, 20);
              data.seg[i].tag.ctrl_id_header_shape_apply = this.readBit(tag, 21, 21);
              data.seg[i].tag.property = this.readBit(tag, 31, 31);
            }
            result.push(data);
            break;
          case HWPTAG_PARA_RANGE_TAG:
            data = {
              name : "HWPTAG_PARA_RANGE_TAG",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              content : [],
            }
            for(let i=0;i<size/12;i++) {
              const range_tag = {
                area_start : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                area_end : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                area_tag_data : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              }
              data.content.push(range_tag);
            }
            // c.move(size);
            result.push(data);
            break;
          case HWPTAG_CTRL_HEADER:
            var start = c.pos;
            data = {
              name : "HWPTAG_CTRL_HEADER",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              ctrl_id : this.ctrlId(content.slice(c.pos, c.move(4))),
            }
            ctrl_id = data.ctrl_id;
            if(data.ctrl_id === "tbl " || data.ctrl_id === "gso ") {
              attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
              data.offset = {
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              },
              data.object = {
                width : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                height : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              },
              data.z_order = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              data.margin = {
                bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                left : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                right : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                top : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              },
              data.instance_id = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
              data.page_divide = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true);
              data.attribute = {
                like_letters : this.readBit(attribute, 0, 0),
                reservation : this.readBit(attribute, 1, 1),
                VertRelTo : this.readBit(attribute, 3, 4) === 0 ? "paper" : this.readBit(attribute, 3, 4) === 1 ? "page" : "para",
                VertRelTo_relative : this.readBit(attribute, 5, 7),
                HorzRelTo : this.readBit(attribute, 8, 9) === 2 ? "column" : this.readBit(attribute, 8, 9) === 3 ? "para" : "page",
                HorzRelTo_relative : this.readBit(attribute, 10, 12),
                VertRelTo_para : this.readBit(attribute, 13, 13) === 0 ? "off" : "on",
                overlap : this.readBit(attribute, 14, 14),
                object_width_standard : this.readBit(attribute, 15, 17),
                object_height_standard : this.readBit(attribute, 18, 19),
                size_protect : this.readBit(attribute, 20, 20),
                object_text_option : this.readBit(attribute, 21, 23),
                object_text_position_option : this.readBit(attribute, 24, 25),
                object_category : this.readBit(attribute, 26, 28),
              }
            }
            /**
              cold ColDef ColDef 단
              secd SecDef SecDef 구역
              fn FootnoteShape FootnoteShape 각주
              en FootnoteShape FootnoteShape 미주
              tbl Table TableCreation 표
              eqed EqEdit EqEdit 수식
              gso ShapeObject ShapeObject 그리기 개체
              atno AutoNum AutoNum 번호넣기
              nwno AutoNum AutoNum 새번호로
              pgct PageNumCtrl PageNumCtrl 페이지 번호 제어 (97의 홀수쪽에서 시작)
              pghd PageHiding PageHiding 감추기
              pgnp PageNumPos PageNumPos 쪽번호 위치
              head HeaderFooter HeaderFooter 머리말
              foot HeaderFooter HeaderFooter 꼬리말
              %dte FieldCtrl FieldCtrl 현재의 날짜/시간 필드
              %ddt FieldCtrl FieldCtrl 파일 작성 날짜/시간 필드
              %pat FieldCtrl FieldCtrl 문서 경로 필드
              %bmk FieldCtrl FieldCtrl 블럭 책갈피
              %mmg FieldCtrl FieldCtrl 메일 머지
              %xrf FieldCtrl FieldCtrl 상호 참조
              %fmu FieldCtrl FieldCtrl 계산식
              %clk FieldCtrl FieldCtrl 누름틀
              %smr FieldCtrl FieldCtrl 문서 요약 정보 필드
              %usr FieldCtrl FieldCtrl 사용자 정보 필드
              %hlk FieldCtrl FieldCtrl 하이퍼링크
              bokm TextCtrl TextCtrl 책갈피
              idxm IndexMark IndexMark 찾아보기
              tdut Dutmal Dutmal 덧말
              tcmt 없음 없음 주석
             */
            // console.log('무야호', data)
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_LIST_HEADER:
            var start = c.pos;
            data = {
              name : "HWPTAG_LIST_HEADER",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            data.paragraph_count = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true); //2
            attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true); //6
            data.text_direction = this.readBit(attribute, 0, 2) === 0 ? 'horizontal' : 'vertical';
            data.line_break = this.readBit(attribute, 3, 4) === 0 ? 'line' : this.readBit(attribute, 3, 4) === 1 ? 'kerning' : 'content_width';
            data.vertical_align = this.readBit(attribute, 5, 6) === 0 ? 'top' : this.readBit(attribute, 5, 6) === 1 ? 'center' : 'bottom';
            data.unknown = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true);

            // c.move(2); //6이라 되어있는데 실제로는 8비트..?는 라노벨 소설 제목급 //8
            if(cell_count !== 0) {
              data.cell_attribute = {
                address : {
                  col : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true), //10
                  row : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true), //12
                },
                span : {
                  col : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true), //12
                  row : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true), //14
                }, 
                cell : {
                  width : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                  height : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                },
                margin : {
                  top : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                  right : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                  bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                  left : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                },
                border_background_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              }
            }
            if(ctrl_id === "tbl ") {
              data.caption = {}
              attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
              switch (this.readBit(attribute, 0, 1)) {
                case 0:
                  data.caption.direction = "left"; //html에서 지원 안함
                  break;
                case 1:
                  data.caption.direction = "right"; //html에서 지원 안함
                  break;
                case 2:
                  data.caption.direction = "top";
                  break;
                case 3:
                  data.caption.direction = "bottom";
                  break;
                default:
                  break;
              }
              data.caption.width_margin = this.readBit(attribute, 2, 2);
              data.caption.margin = this.readBit(attribute, 2, 2);
              data.caption.width = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
              data.caption.letter = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
              data.caption.max_text_width = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            }
            result.push(data);
            var end = c.pos;
            c.move(size - (end - start));
            break;
          case HWPTAG_PAGE_DEF:
            data = {
              name : "HWPTAG_PAGE_DEF",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              paper_width : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              paper_height : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              margin : {
                paper_left : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                right : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                top : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                preface : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                footer : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                binding : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              }
            }
            const paper_attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            data.paper_direction = this.readBit(paper_attribute, 0, 0) === 0 ? 'vertical' : 'horizontal';
            data.restraint = this.readBit(paper_attribute, 1, 2) === 0 ? 'pair_edit' : this.readBit(1, 2) === 1 ? 'opposite_edit' : 'flip_up';
            // c.move(size);
            console.log('HWPTAG_PAGE_DEF', size);
            result.push(data);
            break;
          case HWPTAG_FOOTNOTE_SHAPE:
            const fes = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            const fn_attribute = {
              number_shape : this.shapeArray(this.readBit(fes, 0, 7)),
              page_position : this.readBit(fes, 8, 9),
              numbering : this.readBit(fes, 10, 11),
              subscript : this.readBit(fes, 12, 12),
              prefix : this.readBit(fes, 13, 13),
            }
            data = {
              name : "HWPTAG_FOOTNOTE_SHAPE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              ...fn_attribute,
              custom_sign : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8(0, true),
              front_decoration : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8(0, true),
              back_decoration : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8(0, true),
              start_number : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              breakline_length : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
              breakline_top_margin : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
              breakline_bottom_margin : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
              remark_between_margin : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
              breakline_type : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              breakline_thickness : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              breakline_color : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint16(0, true),
              breakline_unknown : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8(0, true), //자료는 없으나 2칸 남음.
            }
            result.push(data);
            break;
          case HWPTAG_PAGE_BORDER_FILL:
            data = {
              name : "HWPTAG_PAGE_BORDER_FILL",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            this.hwp.Page++;
            c.move(size);
            result.push(data);
            break;
            
          case HWPTAG_SHAPE_COMPONENT:
            var start = c.pos;
            data = {
              name : "HWPTAG_SHAPE_COMPONENT",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              object_control_id : this.ctrlId(content.slice(c.pos, c.move(4))),
              object_control_id2 : this.ctrlId(content.slice(c.pos, c.move(4))),
              group_offset : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              how_to_number_group : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8(0, true),
              object_local_version : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8(0, true),
              initial_width : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              initial_height : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              width : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              height : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              attribute : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true) === 0 ? 'horz_flip' : 'vert_flip',
              rotaion_angle : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
              rotaion_center : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              // render : {
              //   HWPTAG_LIST_HEADER : this.dataview(this.uint_8(content.slice(c.pos, c.move(size - 26 - 42)))).getInt32(0, true),
              //   cell_attribute : {
              //     address : {
              //       column : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //       row : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //     },
              //     merge : {
              //       column_count : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //       row_count : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //     }, 
              //     cell : {
              //       width : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              //       height : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              //     },
              //     margin : {
              //       top : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //       right : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //       bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //       let : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //     },
              //     border_background_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //   }
              // }
            }
            // console.log('조까', c.pos - start);
            data.render = {
              matrix_cnt : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              ratation : this.dataview(this.uint_8(content.slice(c.pos, c.move(48)))).getUint32(0, true),
            }
            data.render.sequence = this.uint_8(content.slice(c.pos, c.move(data.render.matrix_cnt * 48 * 2)));
            var end = c.pos;            
            // console.log(data, "조까튼세상", size, (end - start))
            // c.move(size);
            c.move(size - (end - start));
            // console.log('size', size);
            // console.log("HWPTAG_SHAPE_COMPONENT", data)
            // console.log('size', size)
            // c.move(size); //4가 남는데 왜 남는지 모르겠음.
            result.push(data);
            break;
          case HWPTAG_TABLE:
            //공식문서의 n은 HWPTAG_LIST_HEADER에 들어감
            var start = c.pos;
            data = {
              name : "HWPTAG_TABLE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            data.attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            data.rows = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            data.cols = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            data.cell_spacing = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            data.padding = {
              left : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              right : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              top : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
            }
            data.span = [];
            for (let i = 0; i < data.rows; i++) {
              data.span.push(this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint8());
            }
            data.borderfill_id = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true);
            if(this.hwp.FileHeader.data.version >= 5010) {
              data.valid_zone_info_size = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true);
              data.area_option = this.uint_8(content.slice(c.pos, c.move(2 * data.valid_zone_info_size))); //표 78 참조하여 할것.
            }
            cell_count = data.span.reduce((pre, cur) => pre +cur) + 1; //셀만큼 테이블 내에 넣어줘야해서 더해줌.
            // data.object.text_length = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            // data.object.text = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(4 * data.object.text_length))), 'utf8');
            // data.ctrl_id2 = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            // attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_LINE:
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_LINE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              start_point : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              end_point : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              flag : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
            }
            // c.move(size);
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_RECTANGLE:
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_RECTANGLE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)), 
              sqaure_curvature : content.slice(c.pos, c.move(1)),
              sqaure: {
                x : {
                  top : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  right : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  left : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true)
                }, 
                y : {
                  top : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  right : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  left : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true)
                }
              },
            }
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_ELLIPSE:
            var start = c.pos;
            const arc_attr = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_ELLIPSE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              attribute : {
                between_distance : this.readBit(arc_attr, 0, 0),
                arc : this.readBit(arc_attr, 1, 1),
                arc_type : this.readBit(arc_attr, 2, 9),
              },
              center : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              one : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              two : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              start_pos : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              end_pos : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              start_pos2 : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              end_pos2 : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
            }
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_ARC:
            var start = c.pos;
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_ARC",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              attribute : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),//표92의 값과 일치하지 않음 알수 없음
              ellipse_center_pos : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              one_axis : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              two_axis : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
            }
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_POLYGON:
            if(size === 0) continue;
            var start = c.pos;
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_POLYGON",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              cnt : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true), //표 99
            }
            data.x = this.dataview(this.uint_8(content.slice(c.pos, c.move(4 * data.cnt)))).getInt32(0, true);
            data.y = this.dataview(this.uint_8(content.slice(c.pos, c.move(4 * data.cnt)))).getInt32(0, true);
            var end = c.pos;
            c.move(size - (start - end));
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_CURVE:
            var start = c.pos;
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_CURVE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              cnt : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true), //표 99
            }
            data.x = this.dataview(this.uint_8(content.slice(c.pos, c.move(4 * data.cnt)))).getInt32(0, true);
            data.y = this.dataview(this.uint_8(content.slice(c.pos, c.move(4 * data.cnt)))).getInt32(0, true);
            data.segment_type = content.slice(c.pos, c.move(data.cnt - 1));
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_OLE:
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_OLE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_PICTURE:
            var start = c.pos;
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_PICTURE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              border_color : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              border_width : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              border_type : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              rectangle_position : {
                x : {
                  left : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  top : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  right : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  bottom :this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                },
                y : {
                  left : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  top : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  right : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                },
              },
              padding : {
                left : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                right : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                top : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              },
              cut : {
                left : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                top : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                right : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              },
              info : {
                light : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                contrast : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                effect : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                BinItem : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              }, //5017 버전에선 아래의 것들이 필요 없고 BinItem값도 이상하게 출력 됨.
              // border_opacity : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
              // instance_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), 
              // image_effect : this.dataview(this.uint_8(content.slice(c.pos, c.move(4 * 4)))).getInt32(0, true), 
            }
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_CONTAINER:
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_CONTAINER",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_CTRL_DATA:
            data = {
              name : "HWPTAG_CTRL_DATA",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_EQEDIT:
            var start = c.pos;
            data = {
              name : "HWPTAG_EQEDIT",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              parameter : {
                set_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                set_item_count : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
                item : {
                  id : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                  kind : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                }
              }
            }
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case RESERVED:
            data = {
              name : "RESERVED",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_TEXTART: // 안 나와 있음.
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_TEXTART",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_FORM_OBJECT: // 안 나와 있음
            data = {
              name : "HWPTAG_FORM_OBJECT",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_MEMO_SHAPE: // 안 나와 있음
            data = {
              name : "HWPTAG_MEMO_SHAPE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_MEMO_LIST: // 안 나와 있음
            data = {
              name : "HWPTAG_MEMO_LIST",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_CHART_DATA: // 안 나와 있음
            data = {
              name : "HWPTAG_CHART_DATA",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_VIDEO_DATA: // 안 나와 있음
            data = {
              name : "HWPTAG_VIDEO_DATA",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_SHAPE_COMPONENT_UNKNOWN: // 안 나와 있음
            data = {
              name : "HWPTAG_SHAPE_COMPONENT_UNKNOWN",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          default:
            break;
          }
      }
      // console.log(result);
      return result;
    }
    hwpjs.prototype.shapeArray = function(number) {
      switch (number) {
        case 0:
          return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
          break;
        case 1:
          return ["①","②","③", "④","⑤","⑥","⑦","⑧","⑨","⑩"]
          break;
        case 2:
          return ["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ","Ⅷ", "Ⅸ", "Ⅻ"]
          break;
        case 3:
          return ["ⅰ","ⅱ","ⅲ","ⅳ","ⅴ","ⅵ","ⅶ","ⅷ","ⅸ","ⅻ"]
          break;
        case 4:
          return ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
          break;
        case 5:
          return ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
          break;
        case 6:
          return ["ⓐ", "ⓑ", "ⓒ", "ⓓ", "ⓔ", "ⓕ", "ⓖ", "ⓗ", "ⓘ", "ⓙ"]
          break;
        case 7:
          return ["ⓐ", "ⓑ", "ⓒ", "ⓓ", "ⓔ", "ⓕ", "ⓖ", "ⓗ", "ⓘ", "ⓙ"]
          break;
        case 8:
          return ['가', '나', '다', '라', '마', '바', '사', '아', '차', '카']
          break;
        case 9:
          return ['가', '나', '다', '라', '마', '바', '사', '아', '차', '카']
          break;
        case 10:
          return ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅊ','ㅋ']
          break;
        case 11:
          return ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅊ','ㅋ']
          break;
        case 12:
          return ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십']
          break;
        case 13:
          return ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
          break;
        case 14:
          return ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
          break;
        case 15:
          return ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']
          break;
        case 16:
          return ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
          break;
        case 0x80:
          return '4가지 문자 반복';
          break;
        case 0x81:
          return '사용자 지정 문자 반복'
          break;
        default:
          break;
      }
    }
    hwpjs.prototype.readRecord = function(value) {
      const tagID = value & 0x3FF;
      const level = (value >> 10) & 0x3FF;
      const size = (value >> 20) & 0xFFF;
      if (size === 0xFFF) {
        return {
          tag_id : tagID,
          level : level, 
          size : this.dataview(value).getInt32()
        }
      }
      return {tag_id : tagID, level : level, size : size}
    }
    hwpjs.prototype.readBinRecord = function(value) {
      const Type = this.readBit(value, 0x00, 0x03);
      const Compress = this.readBit(value, 0x04, 0x05);
      const Status = this.readBit(value, 0x08, 0x09);
      return {type : Type, compress : Compress, status : Status}
    }  
    hwpjs.prototype.readBit = function(mask,start,end) {
      const target = mask >> start
      let temp = 0
      for (let index = 0; index <= (end - start); index += 1) {
        temp <<= 1
        temp += 1
      }
      return target & temp;
    }
    hwpjs.prototype.getRGB = function(value) {
      return [
        this.readBit(value, 0, 7),
        this.readBit(value, 8, 15),
        this.readBit(value, 16, 24),
      ]
    }
    hwpjs.prototype.getFlag = function(bits, position) {
      const mask = 1 << position;
      return (bits & mask) === mask;
    }
    hwpjs.prototype.dataview = function(uint_8) {
      return new DataView(uint_8.buffer, 0);
    }
    hwpjs.prototype.getDocInfo = function() {
      const content = pako.inflate(this.uint_8(this.hwp.DocInfo.content), { windowBits: -15 }); //압축되어있어 풀어줘야함
      const data = this.readDocinfo(content);
      return data;
    }
    hwpjs.prototype.readDocinfo = function(content) {
      let c = new Cursor(0);
      // console.log('content',this.readRecord(this.dataview(this.uint_8(content.slice(c.pos, c.pos + 4))).getUint32(0, true)));
      let result = [];
      while(c.pos < content.length) {
        const { tag_id, level, size } = this.readRecord(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true));
        const { HWPTAG_DOCUMENT_PROPERTIES, HWPTAG_ID_MAPPINGS, HWPTAG_BIN_DATA, HWPTAG_FACE_NAME, HWPTAG_BORDER_FILL, HWPTAG_CTRL_HEADER, HWPTAG_CHAR_SHAPE, HWPTAG_TAB_DEF, HWPTAG_NUMBERING, HWPTAG_BULLET, HWPTAG_PARA_SHAPE, HWPTAG_STYLE, HWPTAG_MEMO_SHAPE, HWPTAG_TRACK_CHANGE_AUTHOR, HWPTAG_TRACK_CHANGE, HWPTAG_DOC_DATA, HWPTAG_FORBIDDEN_CHAR, HWPTAG_COMPATIBLE_DOCUMENT, HWPTAG_LAYOUT_COMPATIBILITY, HWPTAG_DISTRIBUTE_DOC_DATA, HWPTAG_TRACKCHANGE } = this.hwp.DATA_RECORD.DOC_INFO;
        let data = {};
        let attr = {};
        let attribute = {};
        switch (tag_id) {
          case HWPTAG_DOCUMENT_PROPERTIES:
            data = {
              name : "HWPTAG_DOCUMENT_PROPERTIES",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              area_count : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //문서 내 각종 시작번호에 대한 정보
              page_start_number : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              footnote_start_number : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              end_start_number : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              image_start_number : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              table_start_number : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              formula_start_number : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //문서 내 캐럿의 위치 정보
              list_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              section_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              paragraph_location : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
            }
            result.push(data);
            break;
          case HWPTAG_ID_MAPPINGS:
            data = {
              name : "HWPTAG_ID_MAPPINGS",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              binary_data : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), // 바이너리 데이터
              font_ko : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), // 한글 글꼴
              font_en : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), // 영어 글꼴
              font_cn : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), // 한자 글꼴
              font_jp : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), // 일어 글꼴
              font_other : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), // 기타 글꼴
              font_symbol : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), // 기호 글꼴
              font_user : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), //사용자 글꼴
              shape_border : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), //테두리 배경
              shape_font : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), //글자 모양
              tab_def : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), //탭 정의
              paragraph_number : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), //문단 번호
              bullet_table : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), // 글머리표
              shape_paragraph : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), //문단 모양
              style : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true), //스타일
            }
            if(this.hwp.FileHeader.data.version >= 5017) {
              data.shape_memo = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true); // 메모 모양(5.0.2.1 이상)인데 5017에도 있음..?
            }
            if(this.hwp.FileHeader.data.version >= 5032) {
              data.change_tracking = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true); //변경 추적(5.0.3.2 이상)
              data.change_tracking_user = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true); //변경 추적 사용자(5.0.3.2 이상)
            }
            result.push(data);
            break;
          case HWPTAG_BIN_DATA:
            attr = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true); // 바이너리 데이터
            const bin_attribute = {
              type : this.readBit(attr, 0, 3) === 0x0000 ? "LINK" : this.readBit(attr, 0, 3) === 0x0001 ? "EMBEDDING" : "STORAGE",
              compress : this.readBit(attr, 4, 5) === 0x0000 ? "default" : this.readBit(attr, 4, 5) === 0x0010 ? "compress" : "decompress",
              access : this.readBit(attr, 8, 9) === 0x0000 ? "none" : this.readBit(attr, 8, 9) === 0x0100 ? "success" : this.readBit(attr, 8, 9) === 0x0200 ? "error" : "ignore",
            }
            const { type, compress, access} = bin_attribute;
            if(type === "LINK") {
              bin_attribute.link_abspath_length = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
              bin_attribute.link = this.dataview(this.uint_8(content.slice(c.pos, c.move(2 * bin_attribute.link_abspath_length)))).getUint16(0, true);
              bin_attribute.link2_abspath_length = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
              bin_attribute.link2 = this.dataview(this.uint_8(content.slice(c.pos, c.move(2 * bin_attribute.link2_abspath_length)))).getUint16(0, true);
            } else {
              bin_attribute.binary_data_id = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
              if(type === "EMBEDDING") {
                bin_attribute.binary_data_length = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
                bin_attribute.extension = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(2 * bin_attribute.binary_data_length)))).replace(/\0/g, '');
                bin_attribute.path = `Root Entry/BinData/BIN${`${bin_attribute.binary_data_id.toString(16).toUpperCase()}`.padStart(4, '0')}.${bin_attribute.extension}`;
                if(bin_attribute.extension === "jpg" || bin_attribute.extension === "bmp" || bin_attribute.extension === "gif") {
                  bin_attribute.image = true;
                }else {
                  bin_attribute.image = false;
                }
              }
            }
            data = {
              name : "HWPTAG_BIN_DATA",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              attribute : {
                ...bin_attribute
              },
            }
            // c.move(size);
            result.push(data);
            break;
          case HWPTAG_FACE_NAME:
            var start = c.pos;
            data = {
              name : "HWPTAG_FACE_NAME",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              font : {
                type : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                length : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              }
            }
            data.font.name = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(2 * data.font.length))),'utf-16le');
            const hasAlternative = this.getFlag(data.font.type, 7);
            const hasAttribute = this.getFlag(data.font.type, 6);
            const hasDefault = this.getFlag(data.font.type, 5);
            if(hasAlternative === true) {
              let type = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
              data.sub_font = {
                type : type === 0 ? false : type === 1 ? 'TTF' : 'HTF',
                length : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true), 
              }
              data.sub_font.name = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(2 * data.sub_font.length))), 'utf-16le');
            }
            if(hasAttribute) {
              data.font_type_info = {
                font_family : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                serif : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                bold : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                proportion : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                contrast : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                stroke_variation : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                stroke_type : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                letter_type : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                middle_line : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                x_height : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              }
            }
            if(hasDefault) {
              data.default_font = {
                length : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
              }
              data.default_font.name = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(2 * data.default_font.length))), 'utf-16le');
            }
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_BORDER_FILL: //공식 문서랑 컬러 가져오는 위치가 다름.
            var start = c.pos;
            function _slash(value) {
              return value;
            } 
            attr = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            attribute = {
              effect : {
                threeD : this.readBit(attr, 0,0),
                shape : this.readBit(attr, 1,1),
              },
              slash : {
                shape : _slash(this.readBit(attr, 2,4)),
                broken_line : this.readBit(attr, 8,9),
                deg180 : this.readBit(attr, 11, 11),
              },
              back_slash : {
                shape : _slash(this.readBit(attr, 5,7)),
                broken_line : this.readBit(attr, 10,10),
                deg180 : this.readBit(attr, 12, 12),
              },
              center_line : this.readBit(attr, 13, 13)
            }
            data = {
              name : "HWPTAG_BORDER_FILL",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              ...attribute,
              // border : {
              //   line : {
              //     left : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              //     right : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              //     top : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              //     bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              //   },
              //   width : {
              //     left : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              //     right : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              //     top : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              //     bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              //   },
              //   color : {
              //     left : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
              //     right : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
              //     top : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
              //     bottom : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
              //   },
              // }
              border : {
                line : {},
                width : {},
                color : {},
              }
            }
            data.border.line.left = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
            data.border.width.left = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
            data.border.color.left = this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true));
            data.border.line.right = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
            data.border.width.right = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
            data.border.color.right = this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true));
            data.border.line.top = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
            data.border.width.top = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
            data.border.color.top = this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true));
            data.border.line.bottom = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
            data.border.width.bottom = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
            data.border.color.bottom = this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true));
            data.border.diagonal = {
              type : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              thickness : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              color : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
            }
            
            const isFill = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt8(0, true);
            if(isFill & 0x0000000 !== 0) {
              data.fill = {
                style : "solid",
              }
            }else if(isFill & 0x0000001 !== 0) {
              data.fill = {
                style : "solid",
                background_color : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
                pattern_color : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
                pattern_type : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              }
            }else if(isFill & 0x0000002 !== 0) {
              data.fill = 'working..';
            }else if(isFill & 0x0000004 !== 0) {
              data.fill = {
                style : "gradation",
                type : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
                italic : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
                horzontal_center : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
                vertical_center : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
                spread : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
                color_cnt : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
              }
              if( data.fill.color_cnt > 2) {
                data.fill.position = this.dataview(this.uint_8(content.slice(c.pos, c.move(4 + data.fill.color_cnt)))).getInt16(0, true);
                data.fill.color = this.dataview(this.uint_8(content.slice(c.pos, c.move(4 + data.fill.color_cnt)))).getInt16(0, true);
              }
            }
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_CTRL_HEADER:
            var start = c.pos;
            data = {
              name : "HWPTAG_CTRL_HEADER",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              ctrl_id : this.ctrlId(content.slice(c.pos, c.move(4))),
            }
            var end = c.pos;
            switch (data.ctrl_id) {
              case "tbl ":
                break;
              case "$lin":
                break;
              case "$rec":
                break;
              case "$ell":
                break;
              case "$arc":
                break;
              case "$pol":
                break;
              case "$cur":
                break;
              case "eqed":
                break;
              case "$pic":
                break;
              case "$ole":
                break;
              case "$con":
                break;
              case "gso":
                break;
              default:
                break;
            }
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_CHAR_SHAPE:
            var start = c.pos;
            data = {
              name : "HWPTAG_CHAR_SHAPE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              font_id : {
                ko : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                en : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                cn : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                jp : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                other : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                symbol : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                user : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              },
              font_stretch : {
                ko : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                en : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                cn : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                jp : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                other : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                symbol : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                user : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              },
              letter_spacing : {
                ko : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                en : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                cn : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                jp : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                other : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                symbol : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                user : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
              },
              relative_size : {
                ko : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                en : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                cn : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                jp : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                other : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                symbol : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
                user : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true),
              },
              text_position : {
                ko : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                en : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                cn : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                jp : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                other : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                symbol : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                user : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
              },
              standard_size : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
              font_attribute : this.text_shape_attr(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
              shadow_space : {
                x : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
                y : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true),
              },
              color : {
                font : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
                underline : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
                shade : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
                shadow : this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true)),
              }, 
            }
            if(this.hwp.FileHeader.data.version >= 5021) {
              data.char_shape_border_fill = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            }
            if(this.hwp.FileHeader.data.version >= 5030) {
              data.char_shape_border_color = this.getRGB(this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true));
            }
            var end = c.pos;
            // if(size > 72) {
            //   c.move(72 - size)
            // }
            // c.move(size - (start - end));
            result.push(data);
            break;
          case HWPTAG_TAB_DEF:
            var start = c.pos;
            attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            data = {
              name : "HWPTAG_TAB_DEF",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              count : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt16(0, true),
              // tab : {
              //   position : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              //   type : this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true), //표 참고.
              //   reservation : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true), //8 바이트 맞춤
              // }
              tab : [],
            }
            if(data.count > 0) {
              for (let i = 0; i < data.count; i++) {
                const temp = {
                  position : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                }
                const type = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
                switch (type) {
                  case 0:
                    temp.type = "left"; 
                    break;
                  case 1:
                    temp.type = "right"; 
                    break;
                  case 2:
                    temp.type = "center"; 
                    break;
                  case 3:
                    temp.type = "decimal"; 
                    break;
                }
                const fill = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getUint8(0, true);
                temp.fill_type = fill; //복잡해서 나중에
                temp.reservation = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true), //8 바이트 맞춤
                data.tab.push(temp);
              }
            }
            console.log('무야호', size, data);
            var end = c.pos;
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_NUMBERING:
            var start = c.pos;
            data = {
              name : "HWPTAG_NUMBERING",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              bullet : [],
              // heaer_info : {
              //   attribute : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              //   width : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //   distance : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              // },
            }
            // c.move(4);
            // data.test = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            // data.shape_id = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(data.test * 2))),'utf-16le');
            // data.hex2 = buf2hex(this.uint_8(content.slice(c.pos - (data.test * 2), c.pos)));
            // console.log(data.test, data.shape_id, data.hex2);
            const _ = new Array(7).fill({});
            for (let i = 0; i < _.length; i++) {
              const temp = {};
              attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
              temp.header_info = {
                width : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                distance : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              };
              switch (this.readBit(attribute, 0, 1)) {
                case 0:
                  temp.header_info.align_type = "left";
                  break;
                case 1:
                  temp.header_info.align_type = "center";
                  break;
                case 2:
                  temp.header_info.align_type = "right";
                  break;
              }
              temp.header_info.instance_like = this.readBit(attribute, 2, 2) === 0 ? false : true;
              temp.header_info.auto_outdent = this.readBit(attribute, 3, 3) === 0 ? false : true;
              temp.header_info.distance_type = this.readBit(attribute, 4, 4) === 0 ? 'ratio' : value;
              // temp.WidthAdjust = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
              // temp.TextOffset = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
              temp.unknown = buf2hex(this.uint_8(content.slice(c.pos, c.move(4))));
              temp.para_length = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
              temp.shape_id = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(temp.para_length * 2))),'utf-16le');
              _[i] = temp;
            }
            data  .temp2 = buf2hex(this.uint_8(content.slice(c.pos, c.move(2))))
            data.bullet = _;
            var end = c.pos;            
            c.move(size - (end - start));
            console.log('data', data);
            result.push(data);
            break;
          case HWPTAG_BULLET:
            var start = c.pos;
            attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            data = {
              name : "HWPTAG_BULLET",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              // flags : this.uint_8(content.slice(c.pos, c.move(4))),
              width : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              space : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              charshape_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
            }
            const bullet = this.uint_8(content.slice(c.pos, c.move(2)));
            const charCode = this.dataview(bullet).getUint16(0, true);
            // console.log('니여친2', charCode, this.textDecoder(data.char2,'utf-16le'));
            switch (charCode) {
              case 45:
                data.char = {char : "&#8208;", size : 'normal', code : charCode};
                break;
              case 61548:
                data.char = {char : "&#9679;", size : 'normal', code : charCode};
                break;
              case 61599:
                data.char = "•";
                data.char = {char : "&#9679;", size : 'small', code : charCode};
                break;
              case 61550:
                data.char = "■";
                data.char = {char : "&#9724;", size : 'normal', code : charCode};
                break;
              case 61607:
                data.char = "▪";
                data.char = {char : "&#9724;", size : 'small', code : charCode};
                break;
              case 61557:
                data.char = "◆";
                data.char = {char : "&#9670;", size : 'normal', code : charCode};
                break;
              case 61559:
                data.char = {char : "&#9670;", size : 'small', code : charCode};
                break;
              case 9654:
                data.char = "▶";
                data.char = {char : "&#9654;", size : 'normal', code : charCode};
                break;
              case 61601:
                data.char = "○";
                data.char = {char : "&#9675;", size : 'normal', code : charCode};
                break;
              case 61551:
                data.char = "□";
                data.char = {char : "&#9633;", size : 'normal', code : charCode};
                break;
              case 9671:
                data.char = {char : "&#9671;", size : 'normal', code : charCode};
                break;
              case 9655:
                data.char = {char : "&#9655;", size : 'normal', code : charCode};
                break;
              // case 61558:
              //   data.char = {char : "&#9673;", size : 'normal', code : charCode};
              //   break;
              case 61558: //마름모4
                data.char = {char : "&#10070;", size : 'normal', code : charCode};
                break;
              case 61604: // 원 두개
                data.char = {char : "&#9673;", size : 'normal', code : charCode};
                break;
              case 61692: //체크
                data.char = {char : "&#10003;", size : 'normal', code : charCode};
                break;
              case 61694: //체크박스
                data.char = {char : "&#9745;", size : 'normal', code : charCode};
                break;
              case 61611: //별표
                data.char = {char : "&#9733;", size : 'normal', code : charCode};
                break;
              case 61558: //손가락 오른쪽
                data.char = {char : "&#9758;", size : 'normal', code : charCode};
                break;
              case 61510: //깜장동그라미
                data.char = {char : "&#9679;", size : 'normal', code : charCode};
                break;
              case 9728: //태양
                data.char = {char : "&#9728;", size : 'normal', code : charCode};
                break;
              default:
                data.char = this.textDecoder(bullet,'utf-16le');
                break;
            }
            // console.log('니여친1', this.textDecoder(bullet,'utf-16le'), buf2hex(bullet), this.dataview(bullet).getUint16(0, true));
            switch (this.readBit(attribute, 0, 1)) {
              case 0:
                data.align_type = 'left';
                break;
              case 1:
                data.align_type = 'center';
                break;
              case 2:
                data.align_type = 'right';
                break;
            }
            data.like_letters = this.readBit(attribute, 2, 2) === 0 ? false : true;
            data.auto_outdent = this.readBit(attribute, 3, 3) === 0 ? false : true;
            data.distance_type = this.readBit(attribute, 4, 4) === 0 ? 'ratio' : 'value';
            var end = c.pos;
            console.log(size, end - start);
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_PARA_SHAPE:
            attr = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            attribute = {
              grid_use : this.readBit(attr, 8, 8)
            }
            switch (this.readBit(attr, 0, 1)) {
              case 0:
                attribute.line_spacing_type = "%"
                break;
              case 1:
                attribute.line_spacing_type = "fixed"
                break;
              case 2:
                attribute.line_spacing_type = "margin"
                break;              
            }
            switch (this.readBit(attr, 2, 4)) {
              case 0:
                attribute.align = "justify";
              case 1:
                attribute.align = "justify";
                break;
              case 2:
                attribute.align = "right";
                break;
              case 3:
                attribute.align = "center";
                break;
              case 4:
                attribute.align = "center"; //배분 정렬??
                break;
              case 5:
                attribute.align = "center"; //나눔정렬??
                break;
            }
            switch (this.readBit(attr, 5, 6)) {
              case 0:
                attribute.line_divide_en = 'word';
                break;
              case 1:
                attribute.line_divide_en = 'hypen';
                break;
              case 2:
                attribute.line_divide_en = 'char';
                break;
            };
            attribute.line_divide_ko = this.readBit(attr, 7, 7) === 0 ? 'word' : 'char';
            attribute.blank_min_value = this.readBit(attr, 9, 15);
            attribute.loner_line_protect = this.readBit(attr, 16, 16);
            attribute.next_paragraph = this.readBit(attr, 17, 17);
            attribute.paragraph_protect = this.readBit(attr, 18, 18);
            attribute.paragraph_page_divide = this.readBit(attr, 19, 19);
            switch (this.readBit(attr, 20, 21)) {
              case 0:
                attribute.vertical_align = 'font';
                break;
              case 1:
                attribute.vertical_align = 'top';
                break;
              case 2:
                attribute.vertical_align = 'middle';
                break;
              case 3:
                attribute.vertical_align = 'bottom';
                break;
            };
            attribute.font_line_height = this.readBit(attr, 22, 22);
            switch (this.readBit(attr, 23, 24)) {
              case 0:
                attribute.paragraph_header_type = 'none';
                break;
              case 1:
                attribute.paragraph_header_type = 'outline';
                break;
              case 2:
                attribute.paragraph_header_type = 'number';
                break;
              case 3:
                attribute.paragraph_header_type = 'bullet';
                break;
            };
            attribute.paragraph_level = this.readBit(attr, 25, 27);
            attribute.is_paragraph_border = this.readBit(attr, 28, 28);
            attribute.padding_ignore = this.readBit(attr, 29, 29);
            attribute.paragraph_tail_shape = this.readBit(attr, 30, 30);
            data = {
              name : "HWPTAG_PARA_SHAPE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              ...attribute,
              margin : {
                left : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                right : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                indent : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                paragraph_spacing : {
                  top : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                  bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                },
                line_spacing : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getInt32(0, true),
                tabdef_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                number_bullet_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                borderfill_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                border_spacing : {
                  left : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                  right : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                  top : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                  bottom : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
                },
              },
            }
            if(this.hwp.FileHeader.data.version >= 5017) {
              data.attribute2 = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            }
            if(this.hwp.FileHeader.data.version >= 5025) {
              data.attribute3 = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
              data.margin.line_spacing = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true);
            }
            // console.log("HWPTAG_PARA_SHAPE", data);
            // c.move(size);
            result.push(data);
            break;
          case HWPTAG_STYLE:
            data = {
              name : "HWPTAG_STYLE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              local : {
                size : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              },
              en : {},
            }
            data.local.name = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(2 * data.local.size))), 'utf-16le');
            data.en.size = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            data.en.name = this.textDecoder(this.uint_8(content.slice(c.pos, c.move(2 * data.en.size))), 'utf-16le');
            data.attribute = content.slice(c.pos, c.move(1));
            data.next_style_id = this.dataview(this.uint_8(content.slice(c.pos, c.move(1)))).getInt8(0, true);
            data.language_id = this.readBit(this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true), 0, 2) === 0 ? 'paragraph' : 'text';
            data.ctrl_id_shape_id = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            data.text_shape_id = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            data.unknown = this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true);
            // c.move(size);
            result.push(data);
            break;
          case HWPTAG_MEMO_SHAPE:
            data = {
              name : "HWPTAG_MEMO_SHAPE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_TRACK_CHANGE_AUTHOR:
            data = {
              name : "HWPTAG_TRACK_CHANGE_AUTHOR",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_TRACK_CHANGE:
            data = {
              name : "HWPTAG_TRACK_CHANGE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_DOC_DATA:
            data = {
              name : "HWPTAG_DOC_DATA",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              // parameter : {
              //   set_id : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getUint16(0, true),
              //   item_count : this.dataview(this.uint_8(content.slice(c.pos, c.move(2)))).getInt16(0, true),
              //   item : [],
              // },
            }
            // data.p
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_FORBIDDEN_CHAR:
            data = {
              name : "HWPTAG_FORBIDDEN_CHAR",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          case HWPTAG_COMPATIBLE_DOCUMENT:
            attribute = this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
            data = {
              name : "HWPTAG_COMPATIBLE_DOCUMENT",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              compatible : attribute === 0 ? "현재버전" : attribute === 1 ? "한글 2007 호환 문서" : "MS 워드 호환 문서",
            }
            // c.move(size);
            result.push(data);
            break;
          case HWPTAG_LAYOUT_COMPATIBILITY:
            data = {
              name : "HWPTAG_LAYOUT_COMPATIBILITY",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              template : {
                text : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                paragraph : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                area : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                object : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                field : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              }
            },
            // c.move(size);
            result.push(data);
            break;
          case HWPTAG_DISTRIBUTE_DOC_DATA:
            var start = c.pos;
            data = {
              name : "HWPTAG_DISTRIBUTE_DOC_DATA",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
              format : {
                text : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                paragraph : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                area : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                object : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
                field : this.dataview(this.uint_8(content.slice(c.pos, c.move(4)))).getUint32(0, true),
              }
            }
            var end = c.pos
            c.move(size - (end - start));
            result.push(data);
            break;
          case HWPTAG_TRACKCHANGE:
            data = {
              name : "HWPTAG_TRACKCHANGE",
              tag_id : tag_id,
              level : level,
              size : size,
              hex : buf2hex(content.slice(c.pos, c.pos + size)),
            }
            c.move(size);
            result.push(data);
            break;
          default:
            break;
        }
      }
      return result;
    }
    hwpjs.prototype.uint_8 = function(uint_8) {
      return new Uint8Array(uint_8);
    }
    hwpjs.prototype.textDecoder = function(uint_8, type = 'utf8') {
      uint_8 = new Uint8Array(uint_8);
      const Decoder = new TextDecoder(type);
      // return Decoder.decode(uint_8).replace(/\0/g, '');
      return Decoder.decode(uint_8);
    }
    hwpjs.prototype.getImage = function(uint_8, type = "png") {
      const image = new Image();
      image.src = URL.createObjectURL(new Blob([new Uint8Array(uint_8)], { type: `image/${type}` }));
      // document.body.appendChild(image);
      return image;
      return new Blob([new Uint8Array(uint_8)], { type: `image/${type}` })
    }
    hwpjs.prototype.getPrvText = function () {
      const result = {
        PrvText : this.textDecoder(this.hwp.PrvText.content, 'utf-16le'),
      }
      // console.log(this.uint_8(this.hwp.PrvText.content))
      // document.body.innerHTML += (this.textDecoder(this.hwp.PrvText.content, 'utf-16le'));
      return result;
    }
    hwpjs.prototype.getPrvImage = function () {
      const result = {
        PrvText : this.getImage(this.hwp.PrvImage.content),
      }
      return result;
    }
    hwpjs.prototype.getFileInfo = function() {
      // console.log('getfileInto');
      const FileHeader = {
        signature: {},
      }
      FileHeader.signature = this.textDecoder(this.hwp.FileHeader.content.slice(0, 32));
      FileHeader.version = parseInt(this.uint_8(this.hwp.FileHeader.content.slice(32, 36)).reverse().join(''));
      FileHeader.attribute = this.uint_8(this.hwp.FileHeader.content.slice(36, 40));
      FileHeader.license = this.uint_8(this.hwp.FileHeader.content.slice(40, 44));
      FileHeader.hwpversion = buf2hex(this.uint_8(this.hwp.FileHeader.content.slice(44, 48)));
      FileHeader.kogl = this.hwp.FileHeader.content.slice(48, 49);
      FileHeader.reservation = this.hwp.FileHeader.content.slice(49, 256);
      return FileHeader;
    }
    hwpjs.prototype.getText = function() {
      return this.hwp.Text.replace(/(\n|\r|\r\n|\n\r)/g,'<br>');
    }
    /**
     * 인덱스 값 입력.
     */
    hwpjs.prototype.getBinImage = function(i) {
      const doc = this.hwp.DocInfo.data.filter(doc=> {
        if(doc.name === "HWPTAG_BIN_DATA" && doc.attribute.image === true) {
          return doc;
        }
      });
      const path = doc[i].attribute.path;
      const extension = doc[i].attribute.extension;
      const Idx = Object.values(this.cfb.FullPaths).findIndex((fullpath) => {
        return fullpath === path;
      })
      const data = this.cfb.FileIndex[Idx];
      const uncompress = pako.inflate(this.uint_8(data.content), { windowBits: -15 });
      const image = new Image();
      image.src = URL.createObjectURL(new Blob([new Uint8Array(uncompress)], { type: `image/${extension}` }));
      // image.dataset.name = data.name
      return image;
    }
    hwpjs.prototype.getPagedef = function() {
      let result = [];
      this.hwp.BodyText.data.map(data => {
        data = data.data;
        Object.values(data).map(section => {
          if(section.name === "HWPTAG_PAGE_DEF") {
            result.push(section);
          }
        });
      });
      return result;
    }
    Number.prototype.hwpPt = function(num) {
      if(num == true) return parseFloat(this / 100)
      else return `${this / 100}pt`;
    }
    Number.prototype.hwpInch = function(num) {
      if(num == true) return parseFloat(this / 7200)
      else return `${this / 7200}in`;
    }
    Number.prototype.borderWidth = function () {
      let result = 0;
      switch (this) {
        case 0:
          result = 0.1;
          break;
        case 1:
          result = 0.12;
          break;
        case 2:
          result = 0.15;
          break;
        case 3:
          result = 0.2;
          break;
        case 4:
          result = 0.25;
          break;
        case 5:
          result = 0.3;
          break;
        case 6:
          result = 0.4;
          break;
        case 7:
          result = 0.5;
          break;
        case 8:
          result = 0.6;
          break;
        case 9:
          result = 0.7;
          break;
        case 10:
          result = 1.0;
          break;
        case 11:
          result = 1.5;
          break;
        case 12:
          result = 2.0;
          break;
        case 13:
          result = 3.0;
          break;
        case 14:
          result = 4.0;
          break;
        case 15:
          result = 5.0;
          break;
      }
      return result;
    }
    Array.prototype.hwpRGB = function() {
      return `rgb(${this.join(',')})`;
    }
    /**
     * bodyText의 필요한 옵션들만 가져와 정리하여 하나의 오브젝트로 구성한다
     * 하나의 오브젝트(표, 단락, 이미지 등의 하나의 객체)
     */
    hwpjs.prototype.ObjectHwp = function() {
      // console.log('test', result.length);
      const result = [];
      const { HWPTAG_PARA_HEADER, HWPTAG_PARA_TEXT, HWPTAG_PARA_CHAR_SHAPE, HWPTAG_PARA_LINE_SEG, HWPTAG_PARA_RANGE_TAG, HWPTAG_CTRL_HEADER, HWPTAG_LIST_HEADER, HWPTAG_PAGE_DEF, HWPTAG_FOOTNOTE_SHAPE, HWPTAG_PAGE_BORDER_FILL, HWPTAG_SHAPE_COMPONENT, HWPTAG_TABLE, HWPTAG_SHAPE_COMPONENT_LINE, HWPTAG_SHAPE_COMPONENT_RECTANGLE, HWPTAG_SHAPE_COMPONENT_ELLIPSE, HWPTAG_SHAPE_COMPONENT_ARC, HWPTAG_SHAPE_COMPONENT_POLYGON, HWPTAG_SHAPE_COMPONENT_CURVE, HWPTAG_SHAPE_COMPONENT_OLE, HWPTAG_SHAPE_COMPONENT_PICTURE, HWPTAG_SHAPE_COMPONENT_CONTAINER, HWPTAG_CTRL_DATA, HWPTAG_EQEDIT, RESERVED, HWPTAG_SHAPE_COMPONENT_TEXTART, HWPTAG_FORM_OBJECT, HWPTAG_MEMO_SHAPE, HWPTAG_MEMO_LIST, HWPTAG_CHART_DATA, HWPTAG_VIDEO_DATA, HWPTAG_SHAPE_COMPONENT_UNKNOWN} = this.hwp.DATA_RECORD.SECTION_TAG_ID;
      this.hwp.BodyText.data.map(section => {
        let data = section.data;
        const cnt = {
          cell : 0,
          paragraph : 0,
          row : 0,
          col : 0,
          tpi : 0, //table paragraph idx
          parashape : 0,
        }
        let $ = {
          type : 'paragraph',
          paragraph : {
            text : '', 
            shape : {},
            image_src : '',
            image_height : '',
            image_width : '',
            height:0,
          }
        };
        const textOpt = {
          align : 'left',
          line_height : 0,
          indent : 0,
        }
        Object.values(data).forEach((_, i) => {
          switch (_.tag_id) {
            case HWPTAG_LIST_HEADER:
              if($.type === "tbl ") {
                const cell = _.cell_attribute;
                const borderfill = this.hwp.BorderFill[_.cell_attribute.border_background_id - 1];
                cnt.row = cell.address.row;
                cnt.col = cell.address.col;
                $.table[cnt.row][cnt.col] = {
                  ...$.table[cnt.row][cnt.col],
                  cell : {
                    width : cell.cell.width.hwpInch(),
                    height : cell.cell.height.hwpInch(),
                  },
                  margin : cell.margin,
                  rowspan : cell.span.row,
                  colspan : cell.span.col,
                  border : {
                    color : {
                      bottom : borderfill.border.color.bottom.hwpRGB(),
                      left : borderfill.border.color.left.hwpRGB(),
                      right : borderfill.border.color.right.hwpRGB(),
                      top : borderfill.border.color.top.hwpRGB(),
                    },
                    line : borderfill.border.line,
                    width : {
                      bottom : borderfill.border.width.bottom.borderWidth(),
                      left : borderfill.border.width.left.borderWidth(),
                      right : borderfill.border.width.right.borderWidth(),
                      top : borderfill.border.width.top.borderWidth(),
                    },
                  },
                }
                if(borderfill.fill) {
                  $.table[cell.address.row][cell.address.col].fill = {
                    background_color : borderfill.fill.background_color.hwpRGB(),
                    style : borderfill.fill.style,
                  }
                }
                if(_.paragraph_count) {
                  $.table[cnt.row][cnt.col].paragraph = new Array(_.paragraph_count);
                  cnt.paragraph = _.paragraph_count;
                }
              }else if($.type === "$rec") {
                cnt.paragraph = _.paragraph_count;
                $.textbox = {};
                $.textbox.paragraph = new Array(_.paragraph_count).fill(true);
                console.log('생성',$.textbox);
              }
              break;
            case HWPTAG_PARA_HEADER:
              /*
              margin:
                border_spacing: {left: 0, right: 0, top: 0, bottom: 0}
                borderfill_id: 0
                indent: 0
                left: 8000
                line_spacing: 160
                number_bullet_id: 0
                paragraph_spacing: {top: 0, bottom: 0}
                right: 0
                tabdef_id: 0
              */
              const ParaShape = this.hwp.ParaShape[_.paragraph_shape_reference_value];
              // const Numbering = this.hwp.Numbering[ParaShape.margin.number_bullet_id];
              const Bullet = this.hwp.Bullet[ParaShape.margin.number_bullet_id - 1];
              const Style = this.hwp.Style[_.paragraph_style_reference_value];
              textOpt.align = ParaShape.align;
              textOpt.line_height = ParaShape.margin.line_spacing;
              textOpt.line_height_type = ParaShape.line_spacing_type;
              textOpt.vertical_align = ParaShape.vertical_align;
              textOpt.paragraph_margin = ParaShape.margin.paragraph_spacing;
              textOpt.indent = ParaShape.margin.indent;
              textOpt.left = ParaShape.margin.left;
              textOpt.right = ParaShape.margin.right;
              if($.type === "tbl " && cnt.paragraph === 0) {
                result.push($);
                $ = {
                  type : 'paragraph',
                  paragraph : {},
                };
                if(Bullet) {
                  console.log('이써야하는데?');
                  $.table[cnt.row][cnt.col].paragraph.bullet = {
                    char : Bullet.char,
                    align_type : Bullet.align_type,
                    distance_type : Bullet.distance_type,
                    width : Bullet.width,
                    like_letters : Bullet.like_letters,
                  }
                }
                // console.log($, _);
              }else if($.type === "$rec" && cnt.paragraph === 0) {
                result.push($);
                $ = {
                  type : 'paragraph',
                  paragraph : {},
                };
                if(Bullet) {
                  $.paragraph.bullet = {
                    char : Bullet.char,
                    align_type : Bullet.align_type,
                    distance_type : Bullet.distance_type,
                    width : Bullet.width,
                    like_letters : Bullet.like_letters,
                  }
                }
              }else if(cnt.paragraph === 0) {
                result.push($);
                $ = {
                  type : 'paragraph',
                  paragraph : {},
                };
                if(Bullet) {
                  $.paragraph.bullet = {
                    char : Bullet.char,
                    align_type : Bullet.align_type,
                    distance_type : Bullet.distance_type,
                    space : Bullet.space,
                    width : Bullet.width,
                    like_letters : Bullet.like_letters,
                  }
                }
              }
              cnt.parashape++;
              break;
            case HWPTAG_PARA_TEXT:
              if($.type === "tbl " && cnt.paragraph !== 0) { //아씨 발 족같네
                $.table[cnt.row][cnt.col].paragraph[cnt.tpi] = {
                  text : _.text,
                  shape : {},
                  image_src : '',
                  image_height : '',
                  image_width : '',
                  height:0,
                  ...textOpt,
                };
              }else if($.type === "$rec" && cnt.paragraph !== 0) {
                $.textbox.paragraph[cnt.tpi] = {
                  text : _.text,
                  shape : {},
                  image_src : '',
                  image_height : '',
                  image_width : '',
                  height:0,
                  ...textOpt,
                };
                // console.log('되야하잖아요', _.text, cnt.tpi, $.textbox.paragraph);
              } else if($.type === "paragraph") {
                $.paragraph = {
                  ...$.paragraph,
                  text : _.text, 
                  shape : {},
                  image_src : '',
                  image_height : '',
                  image_width : '',
                  height:0,
                  ...textOpt,
                };
              } else {
                $.paragraph = {
                  ...$.paragraph,
                  text : _.text, 
                  shape : {},
                  image_src : '',
                  image_height : '',
                  image_width : '',
                  height:0,
                  ...textOpt,
                };
              }
              textOpt.align = 'left';
              textOpt.line_height = 0;
              textOpt.indent = 0;
              textOpt.left = 0;
              textOpt.right = 0;
              textOpt.vertical_align = "text";
              break;
            case HWPTAG_PARA_CHAR_SHAPE:
              if(_.shape) {
                const shape = _.shape.map(shape => {
                  const attr = this.hwp.CharShape[shape.shape_id];
                  const FaceName = this.hwp.FaceName[attr.font_id.ko];
                  return shape = {
                    ...shape,
                    fontName : FaceName.font.name,
                    fontStretch : attr.font_stretch.ko,
                    fontSize : attr.standard_size.hwpPt(),
                    fontColor : attr.color.font.hwpRGB(),
                    letter_spacing : attr.letter_spacing.ko,
                    bold : attr.font_attribute.bold,
                    italic : attr.font_attribute.italic,
                    underline : attr.font_attribute.underline,
                    underline_color : attr.color.underline.hwpRGB(),
                    strikethrough : attr.font_attribute.strikethrough,
                    underline_shape : attr.font_attribute.underline_shape,
                  }
                });
                if($.type === "tbl " && cnt.paragraph !== 0) {
                  try {
                    $.table[cnt.row][cnt.col].paragraph[cnt.tpi].shape = shape;
                  } catch (error) {
                  }
                }else if($.type === "paragraph" && $.paragraph) {
                  $.paragraph.shape = shape;
                }
              }
              break;
            case HWPTAG_PARA_LINE_SEG:
              if($.type === "tbl " && cnt.paragraph !== 0) {
                try { 
                  $.table[cnt.row][cnt.col].paragraph[cnt.tpi].height = _.seg[0].height_line.hwpInch();
                  $.table[cnt.row][cnt.col].paragraph[cnt.tpi].margin = (_.seg[0].line_interval / 2).hwpInch(); //라인간의 거리인데 위아래로 주기 위해서 나누기 2해줌
                  $.table[cnt.row][cnt.col].paragraph[cnt.tpi].start_line = _.seg[0].start_line;
                  $.table[cnt.row][cnt.col].paragraph[cnt.tpi].line_segment = _.seg;
                  $.table.margin = (_.seg[0].line_interval / 2).hwpInch(); //라인간의 거리인데 위아래로 주기 위해서 나누기 2해줌
                  // $.table.start_line = _.seg[0].start_line;
                  // console.log('table_line', $.table.start_line);
                }catch(e){

                }
                cnt.paragraph--;
                if(cnt.paragraph !== 0) cnt.tpi++;
              }else if($.type === "paragraph" && $.paragraph) {
                $.paragraph.height = _.seg[0].height_line.hwpInch();
                $.paragraph.margin = (_.seg[0].line_interval / 2).hwpInch(); //라인간의 거리인데 위아래로 주기 위해서 나누기 2해줌
                $.paragraph.start_line = _.seg[0].start_line;
                $.paragraph.line_segment = _.seg;
              }else if($.type === "paragraph") {
                $.paragraph = {};
                $.paragraph.height = _.seg[0].height_line.hwpInch();
                $.paragraph.margin = (_.seg[0].line_interval / 2).hwpInch(); //라인간의 거리인데 위아래로 주기 위해서 나누기 2해줌
                $.paragraph.start_line = _.seg[0].start_line;
                $.paragraph.line_segment = _.seg;
              }else if($.type === "$rec" && cnt.paragraph !== 0) {
                cnt.paragraph--;
                if(cnt.paragraph !== 0) cnt.tpi++;
              }
              break;
            case HWPTAG_CTRL_HEADER:
              if($.type === "tbl " && _.ctrl_id === "gso ") {
                $.table[cnt.row][cnt.col].paragraph[cnt.tpi].object = _.object;
                $.table[cnt.row][cnt.col].paragraph[cnt.tpi].offset = _.offset;
              }else if($.type === "paragraph" && $.paragraph) {
                $.paragraph.object = _.object;
                $.paragraph.offset = _.offset;
              }else if($.type === "paragraph") {
                $.paragraph = {};
                $.paragraph.object = _.object;
                $.paragraph.offset = _.offset;
              }else if($.type === "$rec" && cnt.paragraph !== 0) {
              }
              break;
            case HWPTAG_TABLE:
              const ctrl_header = data[i-1];
              const line_seg = data[i-2];
              if(line_seg.tag_id === HWPTAG_PARA_LINE_SEG) {
                $.start_line = line_seg.seg[0].start_line;
              }
              if(ctrl_header.tag_id === HWPTAG_CTRL_HEADER) {
                $.width = ctrl_header.object.width.hwpInch();
                $.height = ctrl_header.object.height.hwpInch();
              }
              cnt.paragraph = 0;
              cnt.tpi = 0;
              $.type = "tbl ";
              cnt.cell = _.span.reduce((pre, cur) => pre + cur);
              $.rows = _.rows;
              $.cols = _.cols;
              $.padding = _.padding;
              $.cell_spacing = _.cell_spacing;
              $.span = _.span;
              const table = new Array(_.span.length).fill(true);
              table.forEach((cols, i)=>{
                table[i] = new Array(cols).fill(false);
              });
              $.table = table;
              break;
            case HWPTAG_SHAPE_COMPONENT:
              /**
               * ( 그리기 개체 )
                선 $lin
                사각형 $rec
                타원 $ell
                호 $arc
                다각형 $pol
                곡선 $cur
               */
              // if($.type === "tbl " && cnt.paragraph !== 0 && _.object_control_id === "$pic") {
              if($.type === "tbl " && _.object_control_id === "$pic") {
                if(cnt.cell !== 0 && $.table[cnt.row][cnt.col]) {
                  $.table[cnt.row][cnt.col].paragraph[cnt.tpi].image_height = _.height.hwpInch();
                  $.table[cnt.row][cnt.col].paragraph[cnt.tpi].image_width = _.width.hwpInch();
                  $.table[cnt.row][cnt.col].paragraph[cnt.tpi].group_offset = {
                    x : _.group_offset.x.hwpInch(),
                    y : _.group_offset.y.hwpInch(),
                  };
                }
              }else if(_.object_control_id === "$pic") {
                $.paragraph = {
                  ...$.paragraph,
                  image_height : _.height.hwpInch(),
                  image_width : _.width.hwpInch(),
                  group_offset : {
                    x : _.group_offset.x.hwpInch(),
                    y : _.group_offset.y.hwpInch(),
                  },
                };
              }else if(_.object_control_id === "$rec") {
                $.type = "$rec";
                $.paragraph = {
                  ...$.paragraph,
                  height : _.height.hwpInch(),
                  width : _.width.hwpInch(),
                  group_offset : {
                    x : _.group_offset.x.hwpInch(),
                    y : _.group_offset.y.hwpInch(),
                  },
                };
              }
              break;
            case HWPTAG_SHAPE_COMPONENT_PICTURE:
              const filename = _.info.BinItem; //5017 버전에서 bindataid가 상이한 경우가 있음.
              const info = this.hwp.DocInfo.data.find(data=>data.name === "HWPTAG_BIN_DATA" && data.attribute.binary_data_id === filename);
              const path = `Root Entry/BinData/BIN${`${filename.toString(16).toUpperCase()}`.padStart(4, '0')}.${info.attribute.extension}`;              
              const Idx = Object.values(this.cfb.FullPaths).findIndex((fullpath) => {
                return fullpath === path;
              });
              const imgData = this.cfb.FileIndex[Idx];
              const uncompress = pako.inflate(this.uint_8(imgData.content), { windowBits: -15 });
              if(cnt.cell !== 0 && $.table[cnt.row][cnt.col]) {
                $.table[cnt.row][cnt.col].paragraph[cnt.tpi].image_src = URL.createObjectURL(new Blob([new Uint8Array(uncompress)], { type: `image/${info.attribute.extension}` }));
                $.table[cnt.row][cnt.col].paragraph[cnt.tpi].image = {
                  rectangle_position : _.rectangle_position,
                  padding : _.padding,
                }
              } else {
                $.paragraph.image_src = URL.createObjectURL(new Blob([new Uint8Array(uncompress)], { type: `image/${info.attribute.extension}` }));
                $.paragraph.image = {
                  rectangle_position : _.rectangle_position,
                  padding : _.padding,
                }
              }
              break;
            case HWPTAG_SHAPE_COMPONENT_RECTANGLE: //SHAPE_COMPONENT에서 $rec('사각형')일떄 마지막으로 나옴.
              break;
            default:
              break;
          }
        });
        if($) result.push($);
      });
      console.log(result);
      // console.log('result', result[2].table[0][0].paragraph);
      return result;
    }
    hwpjs.prototype.PageElement = function () {
      const pageDef = this.getPagedef()[0];
      const page = document.createElement('section');
      page.className = "hwp-page";
      page.style.width = pageDef.paper_width.hwpInch();
      page.style.height = pageDef.paper_height.hwpInch();
      page.style.paddingBottom = pageDef.margin.bottom.hwpInch();;
      page.style.paddingTop = pageDef.margin.top.hwpInch();
      page.style.paddingRight = pageDef.margin.right.hwpInch();
      page.style.paddingLeft = pageDef.margin.right.hwpInch();
      const div = document.createElement('div');
      div.style.position = "relative";
      div.style.height = "100%";
      div.style.width = "100%";
      div.className = "hwp-content";
      page.appendChild(div);
      return page;        
    }
    /**
     * text css
     */
    hwpjs.prototype.hwpTextCss = function(paragraph, opt) {
      // const {text, shape, image_height, image_src, image_width, height, margin, start_line, align, bullet, line_height} = paragraph;
      const {left, right, line_segment, text, shape, image_height, image_src, image_width, margin, height, start_line, align, bullet, line_height, line_height_type, indent, image, object, offset, group_offset, paragraph_margin, vertical_align} = paragraph;
      console.log(text, vertical_align);
      const div = document.createElement('div');
      div.className="paragraph_wrapper";
      // div.style.margin = `${margin} 0`;
      div.style.width = "100%";
      div.style.height = "auto";
      // div.style.Height = height;
      if(line_segment) {
        // div.style.top = parseFloat(line_segment[0].start_line).hwpInch();
        div.style.position = "absolute";
      }
      div.style.textAlign = align;
      if(line_height) {
        if(line_height_type === "%") { 
          div.style.lineHeight = `${line_height/100}em`; //임시. 주어진대로 설정하면 레이아웃이 깨짐.
        }
      }
      if(margin) {
        // div.style.marginTop = `${margin.top.hwpInch()}`;
      }
      // if(paragraph_margin) {
      //   div.style.marginTop = `${paragraph_margin.top.hwpInch()}`;
      //   div.style.marginBottom = `${paragraph_margin.bottom.hwpInch()}`;
      // }
      div.dataset.start_line = start_line;
      // div.style.top = parseFloat(start_line).hwpInch();
      // div.style.position = "absolute";
      if(bullet !== undefined) {
        const span = document.createElement('span');
        span.style.position = "relative";
        span.style.display = "inline-flex";
        if(bullet.width) {
          span.style.width = `${bullet.width / 100 * 2}pt`; //넓이는 되었으나 여백이 문제
          // span.style.marginLeft = `${bullet.space / 10}`;
        }
        // span.style.display = "inline-block";
        // span.style.verticalAlign = "top";
        // span.style.alignItems = "center"
        //span.style.float = bullet.align_type; 
        if(bullet.align_type === 'left') {
          //div.marginLeft = bullet.space.hwpInch();
        }else {
        }
        div.style.marginLeft = `${bullet.space.hwpInch()}`;
        // span.style.float = bullet.align_type;
        span.innerHTML = bullet.char.char;
        div.appendChild(span);
      }
      if(image_src) {
        const img = new Image();
        // img.style.position = "absolute";
        // img.style.bottom = 0;
        // img.style.left = 0;
        
        img.src = image_src;
        img.style.height = image_height;
        img.style.width = image_width;
        const img_parent = document.createElement('div');
        img_parent.className = "img_parent";
        img_parent.appendChild(img);
        if(image.rectangle_position) {
          // img.style.left = image.rectangle_position.x.left.hwpInch();
          // img.style.top = image.rectangle_position.x.left.hwpInch();
        }
        if(group_offset) {
          // img_parent.style.left = group_offset.x;
          // img_parent.style.top = group_offset.y;
        }
        if(offset) {
          // img.style.left = offset.x;
          // img.style.top = group_offset.y;
        }
        // if(image) {
        //   img.style.top = image.top.hwpInch();
        //   img.style.left = image.left.hwpInch();
        //   img.style.right = image.right.hwpInch();
        //   img.style.bottom = image.bottom.hwpInch();
        //   img.style.left = image.left.hwpInch();
        //   img.style.top = image.y.hwpInch();
        // }
        div.appendChild(img_parent);
        return div;
      }
      if(!text) {
        // div.innerHTML = "&nbsp;";
        div.style.height = height;
        return div;
      }
      if(!shape) {
        const span = document.createElement('span');
        span.textContent = "text";
        div.appendChild(span);
        return div;
      }
      var length = shape.length;
      // console.log(shape, text);
      const template = [];
      const newline = [];
      for (let i = 1; i < line_segment.length; i++) {
        newline.push(line_segment[i].start_text);
      }
      for (let i = 0; i < length; i++) {
        const span = document.createElement('span');
        const start = shape[i].shape_start;
        const end = length !== i + 1 ? shape[i+1].shape_start : text.length;
        const spanText = text.substring(start, end);
        span.style.color = shape[i].fontColor;
        span.style.fontSize = shape[i].fontSize;
        span.style.textDecoration = `${shape[i].underline} ${shape[i].strikethrough ? 'line-through' : ''}`;
        span.style.textDecorationStyle = `${shape[i].underline_shape}`;
        span.style.textDecorationColor = shape[i].underline_color;
        if(shape[i].bold) {
          span.style.fontWeight = 600;
        }
        span.style.fontFamily = `${shape[i].fontName}, "Arial", sans-serif`;
        // span.style.fontStretch = `${shape[i].fontStretch}%`;
        span.style.letterSpacing = `${shape[i].letter_spacing/100}em`; //대충 유사치 출력 중..
        span.dataset.start = start;
        span.dataset.end = end;
        span.textContent = spanText;
        for (let k = 0; k < newline.length; k++) {
          if(start < newline[k] && newline[k] < end) {
            const clone = span.cloneNode(false);
            clone.textContent = text.substring(newline[k], end);
            span.textContent = text.substring(start, newline[k]);
            clone.dataset.start = newline[k];
            span.dataset.end = newline[k];
            template.push(span);
            template.push(clone);
          } else {
            template.push(span);
          }
        }
        if(newline.length === 0) {
          template.push(span);
        }
      }
      let divHeight = 0;
      for (let i = 0; i < line_segment.length; i++) {
        const p = document.createElement('p');
        // p.style.paddingTop = line_interval.hwpInch();
        const start = line_segment[i].start_text;
        // p.style.display = "inline-block";
        // p.style.justifyContent = "space-between";
        if(line_segment[i].start_column) {
          p.style.paddingTop = line_segment[i].start_column.hwpInch();
        }
        p.style.position = "absolute";
        // console.log('?', line_segment);
        p.style.top = line_segment[i].start_line.hwpInch();
        // p.style.transform = `translateY(-${line_segment[i].start_line.hwpInch()})`;
        p.style.width = line_segment[i].sagment_width.hwpInch();
        const end = line_segment.length !== i + 1 ? line_segment[i+1].start_text : text.length;
        const pText = text.substring(start, end);
        p.dataset.start = line_segment[i].start_text;
        p.dataset.end = end;
        // if(i !==0) {
        //   p.style.marginTop = line_segment[i].line_interval.hwpInch();
        // }
        if(indent && i !== 0) {
          // p.style.textIndent = `-${indent * (-0.003664154103852596)}px`;
          p.style.marginLeft = `${indent * (-0.003664154103852596)}px`;
        }
        if(left) {
          p.style.paddingLeft = `${left * (-0.003664154103852596)}px`;
        }
        if(right) {
          p.style.paddingRight = `${Right * (-0.003664154103852596)}px`;
        }
        template.forEach(span => {
          if(start <= span.dataset.start && end >= span.dataset.end) {
            p.appendChild(span);
          }
        });
        div.appendChild(p);
      }
      return div;
    }
    /**
     * 값 설명
      0 실선
      1 긴 점선
      2 점선
      3 -.-.-.-. 4 -..-..-.. 5 Dash보다 긴 선분의 반복
      6 Dot보다 큰 동그라미의 반복
      7 2중선
      8 가는선 + 굵은선 2중선
      9 굵은선 + 가는선 2중선
      10 가는선 + 굵은선 + 가는선 3중선
      11 물결
      12 물결 2중선
      13 두꺼운 3D
      14 두꺼운 3D(광원 반대)
      15 3D 단선
      16 3D 단선(광원 반대)
     */
    Number.prototype.BorderStyle = function() {
      switch (this) {
        case 0:
          // return "solid";
          break;
        case 1:
          return "solid";
          break;
        case 2:
          return "dashed";
          break;
        case 3:
          return "dotted";
          break;
        case 4:
          return "solid";
          break;
        case 5:
          return "dashed";
          break;
        case 6:
          return "dotted";
          break;
        case 7:
          return "double";
          break;
        case 8:
          return "double";
          break;
        case 9:
          return "double";
          break;
        case 10:
          return "double";
          break;
        case 11:
          return "solid";
          break;
        case 12:
          return "double";
          break;
        case 13:
          return "solid";
          break;
        case 14:
          return "solid";
          break;
        case 15:
          return "solid";
          break;
        case 16:
          return "solid";
          break;
        default:
          return "";
          break;
      }
    }
    hwpjs.prototype.hwpTable = function (data) {
      const { table, padding, cols, rows, cell_spacing, width, height, start_line } = data;
      console.log('table', data);
      const t = document.createElement('table');
      t.style.margin = `${table.margin} 0`;
      t.style.position = "absolute";
      t.style.top = parseFloat(start_line).hwpInch();
      t.style.fontSize = "initial";
      t.dataset.start_line = start_line;
      t.style.width = width;
      t.style.height = height;
      t.style.boxSizing = "content-box";
      if(padding) {
        t.style.paddingTop = padding.top.hwpInch();
        t.style.paddingRight = padding.right.hwpInch();
        t.style.paddingBottom = padding.bottom.hwpInch();
        t.style.paddingLeft = padding.left.hwpInch();
      }
      table.forEach(row=>{
        const tr = t.insertRow();
        row.forEach(col=>{
          const { colspan, rowspan, fill, cell, margin, border, align } = col;
          const td = tr.insertCell();
          // td.style.position = "relative";
          td.style.textAlign = align;
          td.style.width = cell.width;
          td.style.height = cell.height;
          td.rowSpan = rowspan;
          td.colSpan = colspan;
          const div = document.createElement('div');
          div.className="paragraph_parent";
          // div.style.display = "flex";
          // div.style.flexDirection = "column";
          // div.style.justifyContent = "center";
          col.paragraph.forEach(paragraph=>{
            const p = this.hwpTextCss(paragraph);
            // p.style.position = "unset";
            // p.style.height = "100%";
            // p.style.display = "table-cell";
            const pw = p.querySelectorAll('p');
            pw.forEach(ele => {
              ele.style.position ="unset";
            });
            if(pw) {
              // pw.style = "height:100%;width:100%";
            }
            div.appendChild(p);
            if(paragraph.image_width && paragraph.image_height) {
              td.style.height = paragraph.image_height;
            }
          });
          td.style.marginTop = margin.top.hwpInch();
          td.style.marginRight = margin.right.hwpInch();
          td.style.marginBottom = margin.bottom.hwpInch();
          td.style.marginLeft = margin.left.hwpInch();
          if(fill && fill.background_color) {
            td.style.backgroundColor = fill.background_color;
          }
          // if(fill && fill.style) {
          //   td.style.borderStyle = fill.style;
          // }else {
          //   // td.style.borderStyle = `solid`;
          // }
          if(border && border.line) {
            td.style.borderTopStyle = border.line.top.BorderStyle();
            td.style.borderRightStyle = border.line.right.BorderStyle();
            td.style.borderBottomStyle = border.line.bottom.BorderStyle();
            td.style.borderLeftStyle = border.line.left.BorderStyle();
          }
          if(border && border.width) {
            td.style.borderTopWidth = `${border.line.top.BorderStyle() === "double" ? border.width.top * 2 : border.width.top}mm`;
            td.style.borderRightWidth = `${border.line.right.BorderStyle() === "double" ? border.width.right * 2 : border.width.right}mm`;
            td.style.borderBottomWidth = `${border.line.bottom.BorderStyle() === "double" ? border.width.bottom * 2 : border.width.bottom}mm`;
            td.style.borderLeftWidth = `${border.line.left.BorderStyle() === "double" ? border.width.left * 2 : border.width.left}mm`;
          }
          if(border && border.color) {
            td.style.borderTopColor = border.color.top;
            td.style.borderRightColor = border.color.right;
            td.style.borderBottomColor = border.color.bottom;
            td.style.borderLeftColor = border.color.left;
          }else {
            // td.style.border = "1px solid #000";
          }
          td.appendChild(div);
        })
      });
      return t;  
    }
    /**
     * html 변환
     */
    hwpjs.prototype.getHtml = function() {
      const wrapper = document.createElement('atricle');
      wrapper.className = "hwp-wrapper";
      const pages = [this.PageElement()];
      const result = this.ObjectHwp();
      const c = new Cursor(0);
      result.forEach((data, i) => {
        let preline = i > 1 ? result[i-1].paragraph.start_line : data.paragraph.start_line;
        let content = pages[c.pos].querySelector('.hwp-content');
        if(data.type === "tbl ") {
          const p = this.hwpTable(data);          
          if(p.dataset.start_line === "0" || preline > parseInt(p.dataset.start_line)) {
            pages.push(this.PageElement());
            c.move(1);
            wrapper.appendChild(pages[c.pos]);
            content = pages[c.pos].querySelector('.hwp-content');
          }
          content.appendChild(p);
        }else if(data.type === "$rec") {
          const p = this.hwpTable(data);          
          if(p.dataset.start_line === "0" || preline > parseInt(p.dataset.start_line)) {
            pages.push(this.PageElement());
            c.move(1);
            wrapper.appendChild(pages[c.pos]);
            content = pages[c.pos].querySelector('.hwp-content');
          }
          content.appendChild(p);
        }else if(data.type === "paragraph" && data.paragraph) {
          const p = this.hwpTextCss(data.paragraph);
          if(p.dataset.start_line === "0" || preline > parseInt(p.dataset.start_line)) {
            pages.push(this.PageElement());
            c.move(1);
            wrapper.appendChild(pages[c.pos]);
            content = pages[c.pos].querySelector('.hwp-content');
          }
          content.appendChild(p);
        }else {
          const p = this.hwpTextCss(data.paragraph);
          if(p.dataset.start_line === "0" || preline > parseInt(p.dataset.start_line)) {
            pages.push(this.PageElement());
            c.move(1);
            wrapper.appendChild(pages[c.pos]);
            content = pages[c.pos].querySelector('.hwp-content');
          }
          content.appendChild(p);
        }
      });
      if(wrapper.childNodes.length === 0) { //1페이지 일떄 처리
        wrapper.appendChild(pages[c.pos]);
      }
      return wrapper.outerHTML;
    }
    hwpjs.prototype.setHtml = function() {

    }
    return hwpjs;
  })();
  return hwpjs;
}));
let t;
let hwp;
/**
 * HorzRelTo: "column"
HorzRelTo_relative: 3
VertRelTo: "para"
VertRelTo_para: "on"
VertRelTo_relative: 0
like_letters: 0
object_category: 5
object_height_standard: 2
object_text_option: 1
object_text_position_option: 0
object_width_standard: 4
overlap: 0
reservation: 0
size_protect: 0
margin: {bottom: 0, left: 0, right: 0, top: 0}
name: "HWPTAG_CTRL_HEADER"
object: {width: 8648, height: 45538}
offset: {y: 0, x: 0}
attribute: "vert_flip"
group_offset:
x: -6411
y: 0
[[Prototype]]: Object
height: 45540
how_to_number_group: 0
initial_height: 54000
initial_width: 15060
level: 4
name: "HWPTAG_SHAPE_COMPONENT"
object_control_id: "$pic"
object_control_id2: "$pic"
object_local_version: 1
render: {matrix_cnt: 1, ratation: 0, sequence: Uint8Array(96)}
rotaion_angle: 0
rotaion_center:
x: 4324
y: 22770
[[Prototype]]: Object
size: 196
tag_id: 76
width: 8649
[[Prototype]]: Object
182:
border_color: 0
border_type: 0
border_width: 0
cut: {left: 8640, top: 54000, right: 0, bottom: 0}
info: {light: 0, contrast: 0, effect: 0, BinItem: 3}
level: 5
name: "HWPTAG_SHAPE_COMPONENT_PICTURE"
padding: {left: 0, right: 0, top: 0, bottom: 0}
rectangle_position: {x: {…}, y: {…}}
size: 91

 */
(async () => {
  // hwp = new hwpjs('test/sample-5017-pics.hwp')
  // hwp = new hwpjs('test/underline-styles.hwp');
  // hwp = new hwpjs('test.hwp');
  // hwp = new hwpjs('list.hwp');
  // hwp = new hwpjs('test/viewtext.hwp');
  // hwp = await fetch('list.hwp');
  // hwp = await fetch('test/lists-bullet.hwp');
  // hwp = await fetch('test/sample-5017-pics.hwp');
  // hwp = await fetch('test/textbox.hwp');
  // hwp = await fetch('test/underline-styles.hwp');
  // hwp = await fetch('test/paragraph-split-page.hwp');
  // hwp = await fetch('test/charshape.hwp');
  // hwp = await fetch('test/multicolumns.hwp');
  // hwp = await fetch('test/table-caption.hwp');
  // hwp = await fetch('./test.hwp');
  hwp = await fetch('./noori.hwp');
  // hwp = await fetch('./testext.hwp');
  // hwp = await fetch('test/table.hwp');
  const hwpData = await hwp.arrayBuffer();
  t = new hwpjs(hwpData);
  // console.log(t.cfb);
  // console.log(Object.values(t.hwp.CharShape).length, Object.values(t.hwp.ParaShape).length)
  console.log(t.hwp);
  // console.log('header',t.getBodyAttr("HWPTAG_PARA_HEADER"));
  console.log(t.hwp.DocInfo.data);
  console.log(t.hwp.BodyText.data[0].data);
  const data = t.getHtml();
  document.querySelector('.hwpjs').innerHTML = data;
})();

// var worker = new Worker( 'hwpjs.js' );
// worker.postMessage( '워커 실행' );  // 워커에 메시지를 보낸다.
// // 메시지는 JSON구조로 직렬화 할 수 있는 값이면 사용할 수 있다. Object등 
// // worker.postMessage( { name : '302chanwoo' } );
// // 워커로 부터 메시지를 수신한다.
// worker.onmessage = function( e ) {
//   console.log('호출 페이지 - ', e.data );
// };