-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Tempo de geração: 04/12/2025 às 09:08
-- Versão do servidor: 5.7.23-23
-- Versão do PHP: 8.1.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `cledso35_Fornecedores`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `fornecedores`
--

CREATE TABLE `fornecedores` (
  `id` int(11) NOT NULL,
  `codigo` varchar(64) NOT NULL,
  `nome` varchar(255) NOT NULL,
  `apelido` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Despejando dados para a tabela `fornecedores`
--

INSERT INTO `fornecedores` (`id`, `codigo`, `nome`, `apelido`) VALUES
(1, '1933', 'ERALDO REIZ FERREIRA', 'ERALDO'),
(2, '2810', 'MARIA DAS GRACAS NOGUEIRA DE ALMEIDA', 'MAGNO'),
(3, '4183', 'LUCINEI BARBOSA', 'NEI'),
(4, '4181', 'PAULO SERGIO PEREIRA', ''),
(5, '1565', 'TIAGO TRINDADE', 'TIAGO'),
(6, '4185', 'GESIANE DAS GRACAS', 'HELINHO'),
(7, '3504', 'LUIZ ROBERTO DE JESUS ALVES', 'TICA'),
(8, '1776', 'AECIO BARRETO', ''),
(9, '10733', 'JORGE LUIS', 'JORGE LUIS'),
(10, '3862', 'LUIS CARLOS', 'TIMAO'),
(11, '1584', 'OSMAR OLIVEIRA VIEIRA', 'GAJAO'),
(12, '10836', 'MARIO ANDRE', 'DK'),
(13, '6999', 'TANIA DOS SANTOS SENA DA SILVA', 'KAU'),
(14, '4186', 'HILARIO DE SOUZA', ''),
(15, '4184', 'LEANDRO SANTOS', 'LEO'),
(16, '4187', 'MOZART DE AMORIM', ''),
(17, '4182', 'SAMUEL DA COSTA', 'SAMUEL'),
(18, '6979', 'RICARDO DOS SANTOS BARROS', 'RICARDO'),
(19, '6886', 'DIEGO ALVES DOS SANTOS', 'DIEGO'),
(20, '5799', 'GABRIEL CESAR BARROS RAMOS', 'GABRIEL'),
(21, '1797', 'JUAN SENA DOURADO', ''),
(22, '10859', 'Jaqueline Peixoto Vitorino', 'Jaque'),
(23, '10850', 'Tiago Vieira de Almeida', ''),
(24, '4219', 'Marcelo de Jesus Gomes', ''),
(25, '10909', 'Anderson Nunes Santos', '');

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `fornecedores`
--
ALTER TABLE `fornecedores`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `fornecedores`
--
ALTER TABLE `fornecedores`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
