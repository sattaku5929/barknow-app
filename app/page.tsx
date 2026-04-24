"use client";

import React, { FormEvent, useState } from "react";
import { supabase } from "./supabase";

export default function Home() {
  const [view, setView] = useState<"home" | "dogForm">("home");
  const [dogName, setDogName] = useState("");
  const [breed, setBreed] = useState("");
  const [birthday, setBirthday] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [isFlashVisible, setIsFlashVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const showFlash = (message: string, onComplete?: () => void) => {
    setFlashMessage(message);
    setIsFlashVisible(true);
    window.setTimeout(() => setIsFlashVisible(false), 1400);
    if (onComplete) {
      window.setTimeout(() => onComplete(), 1700);
    }
  };

  const handleDogRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      // Supabaseの'dogs'テーブルにデータを挿入
      const { error } = await supabase
        .from('dogs')
        .insert([{ 
          name: dogName, 
          breed: breed, 
          birthday: birthday 
        }]);

      if (error) throw error;

      showFlash("登録しました！", () => {
        setDogName("");
        setBreed("");
        setBirthday("");
        setView("home");
      });
    } catch (error) {
      console.error("Error saving dog:", error);
      alert("保存に失敗しました。Supabaseの設定やテーブル名を確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[#ddeee8] text-[#111827]">
      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-16 pt-14">
        <header>
          <p className="text-center text-[2.1rem] font-semibold tracking-[0.12em] text-[#008661]">
            BarKnow
          </p>
        </header>

        <section className="mt-14 flex flex-1 flex-col justify-center">
          {view === "home" ? (
            <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
              <button
                onClick={() => setView("dogForm")}
                className="h-24 w-full rounded-3xl bg-[#008661] text-lg font-semibold text-white shadow-lg active:scale-95 transition-transform"
              >
                愛犬の健康管理（App） ＋
              </button>
            </div>
          ) : (
            <form onSubmit={handleDogRegister} className="rounded-3xl bg-white p-8 shadow-xl">
              <p className="mb-8 text-xl font-semibold text-[#008661]">愛犬の登録</p>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col border-b border-gray-100 pb-2">
                  <label className="text-xs text-gray-400">名前</label>
                  <input 
                    value={dogName} 
                    onChange={(e) => setDogName(e.target.value)} 
                    placeholder="例：チョコ" 
                    required 
                    className="h-10 outline-none text-lg" 
                  />
                </div>
                <div className="flex flex-col border-b border-gray-100 pb-2">
                  <label className="text-xs text-gray-400">犬種</label>
                  <input 
                    value={breed} 
                    onChange={(e) => setBreed(e.target.value)} 
                    placeholder="例：トイプードル" 
                    required 
                    className="h-10 outline-none text-lg" 
                  />
                </div>
                <div className="flex flex-col border-b border-gray-100 pb-2">
                  <label className="text-xs text-gray-400">誕生日</label>
                  <input 
                    value={birthday} 
                    onChange={(e) => setBirthday(e.target.value)} 
                    type="date" 
                    required 
                    className="h-10 outline-none text-lg" 
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isSaving} 
                  className="mt-6 h-14 rounded-3xl bg-[#008661] text-white font-bold text-lg shadow-md active:scale-95 transition-all disabled:bg-gray-300"
                >
                  {isSaving ? "保存中..." : "登録する"}
                </button>
                <button 
                  type="button" 
                  onClick={() => setView("home")} 
                  className="text-gray-400 text-sm mt-2"
                >
                  キャンセル
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
      
      {/* 通知用フラッシュメッセージ */}
      <div className={`fixed top-12 left-1/2 -translate-x-1/2 bg-[#008661] text-white px-8 py-4 rounded-2xl shadow-2xl transition-all duration-300 z-50 ${isFlashVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}`}>
        {flashMessage}
      </div>
    </div>
  );
}     
