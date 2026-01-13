class MyEnum {
  constructor(id, valore) {
    this.id = id;
    this.valore = valore;
    Object.freeze(this);
  }

  // ---- GETTERS ----
  getId() {
    return this.id;
  }

  getValore() {
    return this.valore;
  }

  // ---- METODI STATICI ----
  static values() {
    return Object.values(MyEnum).filter(v => v instanceof MyEnum);
  }

  static getById(id) {
    return MyEnum.values().find(e => e.id === id).valore;
  }

  static getByValore(valore) {
    return MyEnum.values().find(e => e.valore === valore);
  }
}


// ---- DEFINIZIONE DEI 40 OGGETTI ----

MyEnum._1D  = new MyEnum("1d",  "40");
MyEnum._2D  = new MyEnum("2d",  "4");
MyEnum._3D  = new MyEnum("3d",  "36");
MyEnum._4D  = new MyEnum("4d",  "8");
MyEnum._5D  = new MyEnum("5d",  "12");
MyEnum._6D  = new MyEnum("6d",  "16");
MyEnum._7D  = new MyEnum("7d",  "20");
MyEnum._8D  = new MyEnum("8d",  "24");
MyEnum._9D  = new MyEnum("9d",  "28");
MyEnum._10D = new MyEnum("10d", "32");

MyEnum._1S  = new MyEnum("1s",  "39");
MyEnum._2S  = new MyEnum("2s",  "3");
MyEnum._3S  = new MyEnum("3s",  "35");
MyEnum._4S  = new MyEnum("4s",  "7");
MyEnum._5S  = new MyEnum("5s",  "11");
MyEnum._6S  = new MyEnum("6s",  "15");
MyEnum._7S  = new MyEnum("7s",  "19");
MyEnum._8S  = new MyEnum("8s",  "23");
MyEnum._9S  = new MyEnum("9s",  "27");
MyEnum._10S = new MyEnum("10s", "31");


MyEnum._1C  = new MyEnum("1c",  "38");
MyEnum._2C  = new MyEnum("2c",  "2");
MyEnum._3C  = new MyEnum("3c",  "34");
MyEnum._4C  = new MyEnum("4c",  "6");
MyEnum._5C  = new MyEnum("5c",  "10");
MyEnum._6C  = new MyEnum("6c",  "14");
MyEnum._7C  = new MyEnum("7c",  "18");
MyEnum._8C  = new MyEnum("8c",  "22");
MyEnum._9C  = new MyEnum("9c",  "26");
MyEnum._10C = new MyEnum("10c", "30");

MyEnum._1B  = new MyEnum("1b",  "37");
MyEnum._2B  = new MyEnum("2b",  "1");
MyEnum._3B  = new MyEnum("3b",  "33");
MyEnum._4B  = new MyEnum("4b",  "5");
MyEnum._5B  = new MyEnum("5b",  "9");
MyEnum._6B  = new MyEnum("6b",  "13");
MyEnum._7B  = new MyEnum("7b",  "17");
MyEnum._8B  = new MyEnum("8b",  "21");
MyEnum._9B  = new MyEnum("9b",  "25");
MyEnum._10B = new MyEnum("10b", "29");

Object.freeze(MyEnum); // blocca modifiche alla "enum"


module.exports = MyEnum;