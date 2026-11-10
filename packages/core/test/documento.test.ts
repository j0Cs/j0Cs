import { describe, expect, it } from "vitest";
import { formatarDocumento, formatarTelefone, lerDocumento, lerTelefone, mascararDocumento } from "../src/documento";

describe("CPF e CNPJ", () => {
  it("aceita CPF válido com ou sem pontuação", () => {
    expect(lerDocumento("529.982.247-25")).toEqual({ tipo: "cpf", valor: "52998224725" });
    expect(lerDocumento("52998224725")).toEqual({ tipo: "cpf", valor: "52998224725" });
  });
  it("recusa CPF com dígito errado ou repetido", () => {
    expect(lerDocumento("529.982.247-26")).toBeNull();
    expect(lerDocumento("111.111.111-11")).toBeNull();
    expect(lerDocumento("123")).toBeNull();
  });
  it("aceita CNPJ numérico e alfanumérico", () => {
    expect(lerDocumento("11.222.333/0001-81")).toEqual({ tipo: "cnpj", valor: "11222333000181" });
    // exemplo oficial da Receita para o formato alfanumérico
    expect(lerDocumento("12.ABC.345/01DE-35")).toEqual({ tipo: "cnpj", valor: "12ABC34501DE35" });
    expect(lerDocumento("12.abc.345/01de-35")?.valor).toBe("12ABC34501DE35");
  });
  it("recusa CNPJ com dígito errado", () => {
    expect(lerDocumento("11.222.333/0001-82")).toBeNull();
    expect(lerDocumento("12.ABC.345/01DE-36")).toBeNull();
    expect(lerDocumento("00.000.000/0000-00")).toBeNull();
    expect(lerDocumento(null)).toBeNull();
  });
  it("formata e mascara", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararDocumento("52998224725")).toBe("529.***.***-25");
    expect(mascararDocumento("11222333000181")).toBe("11.***.***/****-81");
  });
});

describe("telefone", () => {
  it("aceita celular e fixo com DDD, com ou sem +55", () => {
    expect(lerTelefone("(11) 98765-4321")).toBe("11987654321");
    expect(lerTelefone("+55 11 98765-4321")).toBe("11987654321");
    expect(lerTelefone("11 3456-7890")).toBe("1134567890");
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
  });
  it("recusa número incompleto ou sem DDD válido", () => {
    for (const t of ["98765-4321", "(01) 98765-4321", "(11) 88765-4321", "abc", ""]) expect(lerTelefone(t)).toBeNull();
  });
});
